import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import * as auth from '../controllers/authController.js';

const router = Router();
router.get('/setup-status', asyncHandler(auth.setupStatus));
router.post('/setup-administrator', asyncHandler(auth.setupAdministrator));
router.post('/register', asyncHandler(auth.register));
router.post('/login', asyncHandler(auth.login));
router.get('/me', authenticate, asyncHandler(auth.me));
router.post('/forgot-password', asyncHandler(auth.forgotPassword));
router.post('/reset-password', asyncHandler(auth.resetPassword));
export default router;
