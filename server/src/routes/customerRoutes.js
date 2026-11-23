import { Router } from 'express';
import { authenticate, requireAnyRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { listCustomerVehicleStatuses } from '../controllers/workshopController.js';

const router = Router();
router.use(authenticate, requireAnyRole('customer'));
router.get('/vehicle-status', asyncHandler(listCustomerVehicleStatuses));
export default router;
