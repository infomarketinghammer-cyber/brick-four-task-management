/**
 * Zod Schemas for User Endpoints
 */

import { z } from 'zod';

export const UserRoleEnum = z.enum(['ADMIN', 'DEPT_HEAD', 'TEAM_LEAD', 'EXECUTIVE']);

export const GetUsersQuerySchema = z.object({
  role: UserRoleEnum.optional(),
  department: z.string().optional(),
  search: z.string().optional(),
  scope: z.string().optional(),
  limit: z.coerce.number().optional(),
});

export const CreateUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional(),
  role: UserRoleEnum,
  manager_id: z.string().nullable().optional(),
  department: z.string().min(1, 'Department is required'),
  designation: z.string().min(1, 'Designation is required'),
});

export const UpdateUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
  email: z.string().email('Invalid email address').optional(),
  phone: z.string().nullable().optional(),
  department: z.string().min(1, 'Department is required').optional(),
  designation: z.string().min(1, 'Designation is required').optional(),
  role: UserRoleEnum.optional(),
  manager_id: z.string().nullable().optional(),
  avatar_url: z.string().url().nullable().optional(),
  is_active: z.boolean().optional(),
  reassign_subordinates_to_id: z.string().nullable().optional(),
});

export const UpdateManagerSchema = z.object({
  manager_id: z.string().min(1, 'manager_id is required'),
});

export type GetUsersQuery = z.infer<typeof GetUsersQuerySchema>;
export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
export type UpdateManagerInput = z.infer<typeof UpdateManagerSchema>;
