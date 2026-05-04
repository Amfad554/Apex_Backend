const express        = require('express');
const router         = express.Router();
const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const adminController = require('../controllers/adminController');

// All admin routes require a valid super_admin token
router.use(verifyToken);
router.use(requireRole('super_admin'));

// ─── Hospitals ─────────────────────────────────────────────────────────────────
router.get   ('/hospitals',                   adminController.getAllHospitals);
router.put   ('/hospitals/:id/approve',       adminController.approveHospital);
router.put   ('/hospitals/:id/suspend',       adminController.suspendHospital);
router.put   ('/hospitals/:id/reactivate',    adminController.reactivateHospital);
router.delete('/hospitals/:id',               adminController.deleteHospital);

// ─── Platform stats ────────────────────────────────────────────────────────────
router.get('/stats', adminController.getPlatformStats);

module.exports = router;