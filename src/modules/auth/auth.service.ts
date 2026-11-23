/**
 * Authentication Business Logic Service
 */

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { dbStore } from '../../db/prisma';
import { User } from '../../types';
import { AppError } from '../../utils/errors';
import {
  persistRefreshToken,
  fetchRefreshTokenFromMongo,
  persistDeleteRefreshToken,
  persistUser,
} from '../../db/mongodb';
import { sendPasswordResetEmail } from '../../utils/email';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../utils/jwt';
import {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  RefreshTokenInput,
  ResetPasswordInput,
} from './auth.schema';

export class AuthService {
  /**
   * Authenticates user email and password, returning tokens and profile.
   */
  static async login(input: LoginInput) {
    // Find user by email (with legacy alias support for admin@company.com / emp@company.com)
    const users = Array.from(dbStore.users.values());
    const searchEmail = input.email.trim().toLowerCase();
    let user = users.find((u) => u.email.toLowerCase() === searchEmail);

    if (!user) {
      if (searchEmail === 'admin@company.com') {
        user = users.find((u) => u.role === 'ADMIN');
      } else if (searchEmail === 'emp@company.com') {
        user = users.find((u) => u.email === 'amolbiradar218@gmail.com') || users[1];
      }
    }

    if (!user || !user.is_active) {
      throw AppError.unauthorized('Invalid email or password credentials');
    }

    // Verify against the stored hash only. The seed data's hash already IS the "Name@123"
    // convention (see makePasswordHash in prisma.ts), so that default already works for any
    // account that's never had its password changed — a plaintext fallback here on top of it
    // was a standing backdoor: once a password was changed or reset, the OLD "Name@123" would
    // still log in forever, which is exactly the opposite of what a password change means.
    const isPasswordValid = await bcrypt.compare(input.password, user.password_hash);

    if (!isPasswordValid) {
      throw AppError.unauthorized('Invalid email or password credentials');
    }

    // Update last login timestamp
    user.last_login_at = new Date();
    user.updated_at = new Date();

    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      hierarchy_level: user.hierarchy_level,
    };

    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    const familyId = crypto.randomUUID ? crypto.randomUUID() : `fam-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const tokenRecord = {
      token: refreshToken,
      userId: user.id,
      familyId,
      isRevoked: false,
      createdAt: new Date(),
    };
    dbStore.refreshTokens.set(refreshToken, tokenRecord);
    persistRefreshToken(tokenRecord).catch((e) => console.error('Failed to persist refresh token:', e));

    const { password_hash, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      tokens: {
        accessToken,
        refreshToken,
      },
    };
  }

  /**
   * Generates a new access token using a valid refresh token with token rotation & reuse detection.
   */
  static async refresh(input: RefreshTokenInput) {
    let record = dbStore.refreshTokens.get(input.refreshToken);

    // Vercel runs several warm serverless instances behind the same URL — a token issued or
    // rotated moments ago on a sibling instance won't be in THIS instance's memory yet.
    // Fall back to Mongo before concluding the token is actually invalid.
    if (!record) {
      const fromMongo = await fetchRefreshTokenFromMongo(input.refreshToken);
      if (fromMongo) {
        record = fromMongo;
        dbStore.refreshTokens.set(record.token, record);
      }
    }

    if (!record) {
      throw AppError.unauthorized('Refresh token is invalid or revoked', 'INVALID_REFRESH_TOKEN');
    }

    // Reuse detection: If token was already revoked/used, revoke ALL user tokens immediately
    if (record.isRevoked) {
      dbStore.revokeAllUserTokens(record.userId);
      throw AppError.unauthorized(
        'Refresh token reuse detected. All sessions for this account have been revoked for security.',
        'TOKEN_REUSE_DETECTED'
      );
    }

    try {
      const payload = verifyRefreshToken(input.refreshToken);
      const user = dbStore.users.get(payload.userId);

      if (!user || !user.is_active) {
        throw AppError.unauthorized('User associated with token is inactive or deleted');
      }

      const newPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        hierarchy_level: user.hierarchy_level,
      };

      const newAccessToken = signAccessToken(newPayload);
      const newRefreshToken = signRefreshToken(newPayload);

      // Rotate refresh token: Mark current as revoked and save new token in same family
      record.isRevoked = true;
      persistRefreshToken(record).catch((e) => console.error('Failed to persist revoked refresh token:', e));
      const newRecord = {
        token: newRefreshToken,
        userId: user.id,
        familyId: record.familyId,
        isRevoked: false,
        createdAt: new Date(),
      };
      dbStore.refreshTokens.set(newRefreshToken, newRecord);
      persistRefreshToken(newRecord).catch((e) => console.error('Failed to persist new refresh token:', e));

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      };
    } catch (err: any) {
      if (err.code === 'TOKEN_REUSE_DETECTED') throw err;
      throw AppError.unauthorized('Invalid or expired refresh token');
    }
  }

  /**
   * Revokes the provided refresh token.
   */
  static async logout(refreshToken?: string) {
    if (refreshToken) {
      const record = dbStore.refreshTokens.get(refreshToken);
      if (record) {
        record.isRevoked = true;
      }
      dbStore.refreshTokens.delete(refreshToken);
      persistDeleteRefreshToken(refreshToken).catch((e) =>
        console.error('Failed to persist refresh token deletion:', e)
      );
    }
    return { message: 'Logged out successfully' };
  }

  /**
   * Generates a password reset token for the specified user email.
   */
  static async forgotPassword(input: ForgotPasswordInput) {
    const users = Array.from(dbStore.users.values());
    const user = users.find((u) => u.email.toLowerCase() === input.email.toLowerCase());

    if (!user) {
      // Return ambiguous message to prevent email enumeration attacks
      return { message: 'If the email exists, a password reset link has been dispatched.' };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    dbStore.resetTokens.set(resetToken, { userId: user.id, expiresAt });

    const emailSent = await sendPasswordResetEmail(user.email, user.name, resetToken);

    return {
      message: 'If the email exists, a password reset link has been dispatched.',
      // Only handed back in the response when no real email is configured — a local/dev
      // fallback so the flow is still testable without Resend set up. Once RESEND_API_KEY
      // is set, the token only ever goes out over email, never in this response.
      ...(emailSent ? {} : { resetToken }),
    };
  }

  /**
   * Resets password given a valid reset token using bcrypt cost factor 12.
   */
  static async resetPassword(input: ResetPasswordInput) {
    const record = dbStore.resetTokens.get(input.token);

    if (!record || record.expiresAt < new Date()) {
      throw AppError.badRequest('Reset token is invalid or expired', 'INVALID_RESET_TOKEN');
    }

    const user = dbStore.users.get(record.userId);
    if (!user) {
      throw AppError.notFound('User not found');
    }

    // Cost factor 12 for password hashing
    user.password_hash = await bcrypt.hash(input.newPassword, 12);
    user.must_change_password = false;
    user.updated_at = new Date();
    persistUser(user);

    dbStore.resetTokens.delete(input.token);

    return { message: 'Password reset successfully. You may now login.' };
  }

  /**
   * Self-service password change — used both for the "you must change your password"
   * first-login flow and a voluntary change from Settings. Requires the current password
   * (whether that's the temporary one or an existing real one) so this can't be used to
   * take over a session without already knowing the current credential.
   */
  static async changePassword(userId: string, input: ChangePasswordInput) {
    const user = dbStore.users.get(userId);
    if (!user) {
      throw AppError.notFound('User not found');
    }

    const isCurrentValid = await bcrypt.compare(input.currentPassword, user.password_hash);
    if (!isCurrentValid) {
      throw AppError.unauthorized('Current password is incorrect', 'INVALID_CURRENT_PASSWORD');
    }

    user.password_hash = await bcrypt.hash(input.newPassword, 12);
    user.must_change_password = false;
    user.updated_at = new Date();
    persistUser(user);

    return { message: 'Password changed successfully.' };
  }

  /**
   * Retrieves profile details for the authenticated user.
   */
  static async getMe(userId: string) {
    const user = dbStore.users.get(userId);
    if (!user) {
      throw AppError.notFound('User profile not found');
    }

    const manager = user.manager_id ? dbStore.users.get(user.manager_id) : null;

    const { password_hash, ...userWithoutPassword } = user;

    return {
      ...userWithoutPassword,
      manager: manager
        ? {
            id: manager.id,
            name: manager.name,
            email: manager.email,
            role: manager.role,
            designation: manager.designation,
          }
        : null,
    };
  }
}
