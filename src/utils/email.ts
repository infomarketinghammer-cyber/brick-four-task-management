/**
 * Transactional email via Resend (https://resend.com) — plain fetch against their REST API,
 * no SDK dependency needed. Set RESEND_API_KEY and RESEND_FROM_EMAIL to enable; without them,
 * sendPasswordResetEmail() logs a warning and the caller falls back to returning the reset
 * token directly in the API response (local/dev convenience only).
 */

const RESEND_API_URL = 'https://api.resend.com/emails';

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    console.warn('[Email] RESEND_API_KEY/RESEND_FROM_EMAIL not set — skipping real send.');
    return false;
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[Email] Resend API error ${res.status}:`, body);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[Email] Failed to send via Resend:', err);
    return false;
  }
}

export async function sendPasswordResetEmail(
  to: string,
  userName: string,
  resetToken: string
): Promise<boolean> {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const resetLink = `${appUrl.replace(/\/$/, '')}/reset-password?token=${resetToken}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #8B1E22;">BrickFour Task Management</h2>
      <p>Hi ${userName || 'there'},</p>
      <p>We received a request to reset your password. Click the button below to choose a new one. This link expires in 1 hour.</p>
      <p style="margin: 24px 0;">
        <a href="${resetLink}" style="background: #4f46e5; color: #fff; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: bold;">
          Reset Your Password
        </a>
      </p>
      <p style="color: #666; font-size: 12px;">If you didn't request this, you can safely ignore this email.</p>
      <p style="color: #999; font-size: 11px; word-break: break-all;">${resetLink}</p>
    </div>
  `;

  return sendEmail(to, 'Reset your BrickFour password', html);
}

export async function sendWelcomeEmail(
  to: string,
  userName: string,
  temporaryPassword: string
): Promise<boolean> {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const loginLink = `${appUrl.replace(/\/$/, '')}/login`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #8B1E22;">Welcome to BrickFour Task Management</h2>
      <p>Hi ${userName},</p>
      <p>An account has been created for you. Use these temporary credentials to sign in — you'll be asked to set your own password on first login.</p>
      <p style="margin: 20px 0; padding: 14px; background: #f8f8f8; border-radius: 8px;">
        <strong>Login:</strong> ${to}<br/>
        <strong>Temporary Password:</strong> ${temporaryPassword}
      </p>
      <p style="margin: 24px 0;">
        <a href="${loginLink}" style="background: #4f46e5; color: #fff; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: bold;">
          Sign In
        </a>
      </p>
    </div>
  `;

  return sendEmail(to, 'Your BrickFour account is ready', html);
}
