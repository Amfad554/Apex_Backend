const express = require('express');
const router = express.Router();
const { verifyToken, isHospitalAdmin, isSuperAdmin } = require('../middleware/authMiddleware');
const {
  getSubscriptionStatus,
  submitProof,
  getPendingSubscriptions,
  activateSubscription,
} = require('../controllers/subscriptionController');

// NOTE: specific paths must come before /:hospitalId to avoid route conflicts
router.get('/status', verifyToken, isHospitalAdmin, getSubscriptionStatus);
router.post('/proof', submitProof);
router.get('/pending', verifyToken, isSuperAdmin, getPendingSubscriptions);
router.patch('/:hospitalId/activate', verifyToken, isSuperAdmin, activateSubscription);

module.exports = router;