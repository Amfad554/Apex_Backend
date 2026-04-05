const express = require('express');
const router  = express.Router();
const { verifyToken, isSuperAdmin } = require('../middleware/authMiddleware');
const adminController = require('../controllers/adminController');

router.use(verifyToken, isSuperAdmin);

router.get('/hospitals',            adminController.getAllHospitals);
router.put('/hospitals/:id/approve', adminController.approveHospital);
router.get('/stats',                adminController.getPlatformStats);

module.exports = router;