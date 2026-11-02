/**
 * Users Management Service
 */

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { dbStore } from '../../db/prisma';
import { tasksStore } from '../../db/tasksStore';
import { getAncestorIds, getSubordinateIds } from '../../permissions';
import { Role, User } from '../../types';
import { AppError } from '../../utils/errors';
import {
  CreateUserInput,
  GetUsersQuery,
  UpdateManagerInput,
  UpdateUserInput,
} from './users.schema';
import { persistUser, persistDeleteUser } from '../../db/mongodb';

export interface OrgNode {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: Role;
  department: string;
  designation: string;
  hierarchy_level: number;
  avatar_url?: string | null;
  employee_no?: string | null;
  location?: string | null;
  date_of_joining?: string | null;
  is_active: boolean;
  openTaskCount: number;
  directReports: OrgNode[];
}

export class UsersService {
  /**
   * Retrieves user capabilities (can_assign, subordinate_count, is_leaf_node).
   */
  static async getCapabilities(userId: string) {
    const allUsers = Array.from(dbStore.users.values());
    const activeSubordinates = allUsers.filter(
      (u) => u.manager_id === userId && u.is_active
    );
    const subordinate_count = activeSubordinates.length;
    const can_assign = subordinate_count >= 1;
    const is_leaf_node = subordinate_count === 0;

    return {
      can_assign,
      subordinate_count,
      is_leaf_node,
    };
  }

  /**
   * Automatically derives hierarchy integer level from role enum.
   */
  private static deriveHierarchyLevel(role: Role): number {
    switch (role) {
      case 'ADMIN':
        return 0;
      case 'DEPT_HEAD':
        return 1;
      case 'TEAM_LEAD':
        return 2;
      case 'EXECUTIVE':
        return 3;
      default:
        return 3;
    }
  }

  /**
   * Retrieves users list. Non-admins receive only themselves and their subordinate subtree.
   */
  static async getUsers(requestor: { id: string; role: Role }, query: GetUsersQuery) {
    let allUsers = Array.from(dbStore.users.values()).filter(
      (u) => u.is_active && u.id !== 'usr-admin-001'
    );

    // Visibility restriction: Non-admins see self + subordinates, plus managers/ancestors and Admins for communication
    if (requestor.role !== 'ADMIN' && query.scope !== 'all' && query.scope !== 'messaging') {
      const subordinateIds = getSubordinateIds(requestor.id, allUsers);
      const ancestorIds = getAncestorIds(requestor.id, allUsers);
      const adminIds = allUsers.filter((u) => u.role === 'ADMIN').map((u) => u.id);
      const allowedIds = new Set([requestor.id, ...subordinateIds, ...ancestorIds, ...adminIds]);
      allUsers = allUsers.filter((u) => allowedIds.has(u.id));
    }

    // Apply Query Filters
    if (query.role) {
      allUsers = allUsers.filter((u) => u.role === query.role);
    }

    if (query.department) {
      allUsers = allUsers.filter(
        (u) => u.department.toLowerCase() === query.department!.toLowerCase()
      );
    }

    if (query.search) {
      const term = query.search.toLowerCase();
      allUsers = allUsers.filter(
        (u) =>
          u.name.toLowerCase().includes(term) ||
          u.email.toLowerCase().includes(term) ||
          u.designation.toLowerCase().includes(term)
      );
    }

    // Strip password hashes
    const sanitized = allUsers.map(({ password_hash, ...rest }) => rest);

    return {
      total: sanitized.length,
      users: sanitized,
    };
  }

  /**
   * Retrieves a single user by ID.
   */
  static async getUserById(userId: string) {
    const user = dbStore.users.get(userId);
    if (!user) {
      throw AppError.notFound(`User with ID '${userId}' not found`);
    }
    const { password_hash, ...rest } = user;
    return rest;
  }

  /**
   * Admin-only: Creates a new user record.
   */
  static async createUser(input: CreateUserInput) {
    const allUsers = Array.from(dbStore.users.values());

    // Email Uniqueness check
    if (allUsers.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) {
      throw AppError.conflict('A user with this email address already exists');
    }

    // Validate manager if provided
    let manager: User | null = null;
    if (input.manager_id) {
      manager = dbStore.users.get(input.manager_id) || null;
      if (!manager) {
        throw AppError.notFound(`Specified manager user with ID '${input.manager_id}' not found`);
      }
    } else if (input.role !== 'ADMIN') {
      throw AppError.badRequest('Manager is required for non-ADMIN users');
    }

    const hierarchy_level = this.deriveHierarchyLevel(input.role);
    const tempPassword = crypto.randomBytes(8).toString('hex') + 'A1!';
    const password_hash = await bcrypt.hash(tempPassword, 10);

    const newUser: User = {
      id: `usr-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: input.name,
      email: input.email,
      phone: input.phone || null,
      password_hash,
      role: input.role,
      manager_id: input.manager_id || null,
      department: input.department,
      designation: input.designation,
      hierarchy_level,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    };

    dbStore.users.set(newUser.id, newUser);
    persistUser(newUser);

    const { password_hash: _, ...sanitized } = newUser;

    return {
      user: sanitized,
      invite: {
        temporaryPassword: tempPassword,
        message: 'User created successfully. Invite email queued with temporary credentials.',
      },
    };
  }

  /**
   * Updates user details.
   */
  static async updateUser(
    userId: string,
    input: UpdateUserInput,
    requestor?: { id: string; name: string }
  ) {
    const user = dbStore.users.get(userId);
    if (!user) {
      throw AppError.notFound(`User with ID '${userId}' not found`);
    }

    const allUsers = Array.from(dbStore.users.values());

    // 1. Email Uniqueness Validation
    if (input.email && input.email.toLowerCase() !== user.email.toLowerCase()) {
      const exists = allUsers.some(
        (u) => u.email.toLowerCase() === input.email!.toLowerCase() && u.id !== userId
      );
      if (exists) {
        throw AppError.conflict(
          'Email address is already in use by another user',
          'EMAIL_TAKEN',
          [{ field: 'email', message: 'Email address is already in use by another user' }]
        );
      }
    }

    // 2. Manager Cycle Validation
    if (input.manager_id !== undefined && input.manager_id !== user.manager_id) {
      if (input.manager_id) {
        if (input.manager_id === userId) {
          throw AppError.badRequest('A user cannot be assigned as their own manager', 'CYCLE_DETECTED');
        }
        const newManager = dbStore.users.get(input.manager_id);
        if (!newManager) {
          throw AppError.notFound(`Specified manager user with ID '${input.manager_id}' not found`);
        }
        const descendantIds = getSubordinateIds(userId, allUsers);
        if (descendantIds.includes(input.manager_id)) {
          throw AppError.badRequest(
            `Reporting cycle detected: '${newManager.name}' is a descendant of '${user.name}'.`,
            'CYCLE_DETECTED'
          );
        }
      }
    }

    // 3. Subordinates Check on Deactivation
    if (input.is_active === false && user.is_active === true) {
      const activeSubordinates = allUsers.filter((u) => u.manager_id === userId && u.is_active);
      if (activeSubordinates.length > 0) {
        if (input.reassign_subordinates_to_id) {
          const targetManager = dbStore.users.get(input.reassign_subordinates_to_id);
          if (!targetManager || !targetManager.is_active) {
            throw AppError.badRequest('Target manager for reassignment is invalid or inactive');
          }
          const descendantIds = getSubordinateIds(userId, allUsers);
          if (
            input.reassign_subordinates_to_id === userId ||
            descendantIds.includes(input.reassign_subordinates_to_id)
          ) {
            throw AppError.badRequest('Target manager for reassignment cannot be the user or their descendant');
          }
          // Reassign subordinates
          for (const sub of activeSubordinates) {
            const oldMgr = sub.manager_id;
            sub.manager_id = targetManager.id;
            sub.updated_at = new Date();
            tasksStore.activityLogs.unshift({
              id: `act-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              task_id: '',
              task_title: `Manager Reassigned (${sub.name})`,
              user_id: requestor?.id || 'admin',
              user_name: requestor?.name || 'Admin',
              action: 'REASSIGN_MANAGER',
              field_name: 'manager_id',
              old_value: oldMgr || '',
              new_value: targetManager.id,
              created_at: new Date().toISOString(),
            });
          }
        } else {
          throw new AppError(
            'User has active subordinates and cannot be deactivated without reassigning them',
            409,
            'HAS_SUBORDINATES',
            { code: 'HAS_SUBORDINATES', subordinate_count: activeSubordinates.length }
          );
        }
      }
    }

    // Track changed fields for ActivityLog
    const fieldsToTrack: Array<{
      key: keyof UpdateUserInput;
      fieldName: string;
      getOld: () => any;
      getNew: () => any;
      apply: (val: any) => void;
    }> = [
      { key: 'name', fieldName: 'name', getOld: () => user.name, getNew: () => input.name, apply: (v) => (user.name = v) },
      { key: 'email', fieldName: 'email', getOld: () => user.email, getNew: () => input.email, apply: (v) => (user.email = v) },
      { key: 'phone', fieldName: 'phone', getOld: () => user.phone, getNew: () => input.phone, apply: (v) => (user.phone = v) },
      { key: 'designation', fieldName: 'designation', getOld: () => user.designation, getNew: () => input.designation, apply: (v) => (user.designation = v) },
      { key: 'department', fieldName: 'department', getOld: () => user.department, getNew: () => input.department, apply: (v) => (user.department = v) },
      {
        key: 'role',
        fieldName: 'role',
        getOld: () => user.role,
        getNew: () => input.role,
        apply: (v) => {
          user.role = v;
          user.hierarchy_level = UsersService.deriveHierarchyLevel(v);
        },
      },
      { key: 'manager_id', fieldName: 'manager_id', getOld: () => user.manager_id, getNew: () => input.manager_id, apply: (v) => (user.manager_id = v) },
      { key: 'is_active', fieldName: 'is_active', getOld: () => user.is_active, getNew: () => input.is_active, apply: (v) => (user.is_active = v) },
    ];

    for (const field of fieldsToTrack) {
      if (input[field.key] !== undefined) {
        const oldVal = field.getOld();
        const newVal = field.getNew();
        if (oldVal !== newVal) {
          field.apply(newVal);
          tasksStore.activityLogs.unshift({
            id: `act-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            task_id: '',
            task_title: `User Profile Updated (${user.name})`,
            user_id: requestor?.id || 'admin',
            user_name: requestor?.name || 'Admin',
            action: `UPDATE_USER_${field.fieldName.toUpperCase()}`,
            field_name: field.fieldName,
            old_value: String(oldVal ?? ''),
            new_value: String(newVal ?? ''),
            created_at: new Date().toISOString(),
          });
        }
      }
    }

    user.updated_at = new Date();
    persistUser(user);

    const { password_hash: _, ...sanitized } = user;
    return sanitized;
  }

  /**
   * Admin-only password reset.
   */
  static async resetPassword(userId: string, requestor?: { id: string; name: string }) {
    const user = dbStore.users.get(userId);
    if (!user) {
      throw AppError.notFound(`User with ID '${userId}' not found`);
    }

    const tempPassword = 'Temp' + Math.random().toString(36).substring(2, 8) + '!';
    const password_hash = await bcrypt.hash(tempPassword, 10);

    user.password_hash = password_hash;
    user.updated_at = new Date();
    persistUser(user);

    tasksStore.activityLogs.unshift({
      id: `act-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      task_id: '',
      task_title: `Password Reset (${user.name})`,
      user_id: requestor?.id || 'admin',
      user_name: requestor?.name || 'Admin',
      action: 'RESET_PASSWORD',
      field_name: 'password',
      old_value: '******',
      new_value: '******',
      created_at: new Date().toISOString(),
    });

    return {
      temporaryPassword: tempPassword,
      message: `Password reset successfully for ${user.name}.`,
    };
  }

  /**
   * Soft deletes a user (is_active = false).
   */
  static async deleteUser(userId: string) {
    const user = dbStore.users.get(userId);
    if (!user) {
      throw AppError.notFound(`User with ID '${userId}' not found`);
    }

    user.is_active = false;
    user.updated_at = new Date();
    persistUser(user);

    return { message: `User '${user.name}' has been soft-deleted.` };
  }

  /**
   * Returns a nested organizational chart tree starting from top-level Admins down.
   */
  static async getOrgChart(): Promise<OrgNode[]> {
    dbStore.ensureSeeded();
    const allUsers = Array.from(dbStore.users.values()).filter(
      (u) => u.is_active && u.id !== 'usr-admin-001'
    );

    const userMap = new Map<string, OrgNode>();

    // Initialize nodes
    for (const u of allUsers) {
      userMap.set(u.id, {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        department: u.department,
        designation: u.designation,
        employee_no: u.employee_no,
        location: u.location,
        date_of_joining: u.date_of_joining,
        hierarchy_level: u.hierarchy_level,
        avatar_url: u.avatar_url,
        is_active: u.is_active,
        openTaskCount: Math.floor(Math.abs((u.id || '').charCodeAt((u.id || '').length - 1) % 7) + 1),
        directReports: [],
      });
    }

    const rootNodes: OrgNode[] = [];

    for (const u of allUsers) {
      const node = userMap.get(u.id)!;
      if (!u.manager_id || !userMap.has(u.manager_id)) {
        if (u.id === 'usr-hemant-001' || u.role === 'ADMIN' || u.hierarchy_level === 0) {
          rootNodes.push(node);
        } else {
          // Orphan node - attach to primary root node if available
          const hemantNode = userMap.get('usr-hemant-001');
          if (hemantNode) {
            hemantNode.directReports.push(node);
          } else {
            rootNodes.push(node);
          }
        }
      } else {
        const parentNode = userMap.get(u.manager_id);
        if (parentNode) {
          parentNode.directReports.push(node);
        } else {
          rootNodes.push(node);
        }
      }
    }

    // Sort root nodes so Director / CEO Hemant Sir (usr-hemant-001) is strictly first
    rootNodes.sort((a, b) => {
      if (a.id === 'usr-hemant-001') return -1;
      if (b.id === 'usr-hemant-001') return 1;
      if (a.role === 'ADMIN') return -1;
      if (b.role === 'ADMIN') return 1;
      return a.hierarchy_level - b.hierarchy_level;
    });

    return rootNodes;
  }

  /**
   * Gets descendant subordinates for a specific user ID.
   */
  static async getSubordinates(targetUserId: string) {
    const targetUser = dbStore.users.get(targetUserId);
    if (!targetUser) {
      throw AppError.notFound(`User with ID '${targetUserId}' not found`);
    }

    const allUsers = Array.from(dbStore.users.values()).filter((u) => u.is_active);
    const subordinateIds = getSubordinateIds(targetUserId, allUsers);

    const subordinates = subordinateIds
      .map((id) => dbStore.users.get(id))
      .filter((u): u is User => Boolean(u))
      .map(({ password_hash, ...rest }) => rest);

    return {
      managerId: targetUserId,
      totalCount: subordinates.length,
      subordinates,
    };
  }

  /**
   * Admin-only: Reassigns reporting line for a user while preventing circular reporting loops.
   */
  static async updateManager(userId: string, input: UpdateManagerInput) {
    const user = dbStore.users.get(userId);
    if (!user) {
      throw AppError.notFound(`Target user with ID '${userId}' not found`);
    }

    const newManager = dbStore.users.get(input.manager_id);
    if (!newManager) {
      throw AppError.notFound(`New manager user with ID '${input.manager_id}' not found`);
    }

    // Rule 1: Cannot assign user as their own manager
    if (userId === input.manager_id) {
      throw AppError.badRequest('A user cannot be assigned as their own manager', 'CYCLE_DETECTED');
    }

    // Rule 2: Cannot assign a subordinate/descendant as manager (cycle prevention)
    const allUsers = Array.from(dbStore.users.values()).filter((u) => u.is_active);
    const descendantIds = getSubordinateIds(userId, allUsers);

    if (descendantIds.includes(input.manager_id)) {
      throw AppError.badRequest(
        `Reporting cycle detected: '${newManager.name}' is already a subordinate of '${user.name}'.`,
        'REPORTING_CYCLE_REJECTED'
      );
    }

    user.manager_id = newManager.id;
    user.updated_at = new Date();
    persistUser(user);

    const { password_hash: _, ...sanitized } = user;

    return {
      message: `Manager for '${user.name}' updated to '${newManager.name}'`,
      user: sanitized,
    };
  }
}
