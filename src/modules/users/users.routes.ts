/**
 * Express Router for Users Routes
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { UsersController } from './users.controller';

const router = Router();

// All user routes require authentication
router.use(authenticate);

// Publicly authenticated endpoints
router.get('/me/capabilities', UsersController.getCapabilities);
router.get('/', UsersController.getUsers);
router.get('/org-chart', UsersController.getOrgChart);
router.get('/:id/subordinates', UsersController.getSubordinates);
router.get('/:id', UsersController.getUserById);

// Admin-gated user management
router.post('/', requireRole('ADMIN'), UsersController.createUser);
router.patch('/:id', requireRole('ADMIN'), UsersController.updateUser);
router.delete('/:id', requireRole('ADMIN'), UsersController.deleteUser);
router.patch('/:id/manager', requireRole('ADMIN'), UsersController.updateManager);
router.post('/:id/reset-password', requireRole('ADMIN'), UsersController.resetPassword);

export default router;
