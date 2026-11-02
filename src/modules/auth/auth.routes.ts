/**
 * Express Router for Authentication Routes
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { rateLimit } from '../../middleware/rateLimit';
import { AuthController } from './auth.controller';

const router = Router();

router.post('/login', AuthController.login);
router.post('/refresh', AuthController.refresh);
router.post('/logout', AuthController.logout);
router.post('/forgot-password', rateLimit(15 * 60 * 1000, 5), AuthController.forgotPassword);
router.post('/reset-password', rateLimit(15 * 60 * 1000, 5), AuthController.resetPassword);

// Protected routes
router.get('/me', authenticate, AuthController.getMe);

export default router;
