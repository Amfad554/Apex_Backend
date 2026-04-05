const express = require('express');
const router  = express.Router();
const { verifyToken, isHospitalAdmin } = require('../middleware/authMiddleware');
const hospitalsController = require('../controllers/hospitalController');

router.get('/search',  hospitalsController.searchHospitals);                          // public
router.get('/stats',   verifyToken, isHospitalAdmin, hospitalsController.getHospitalStats);
router.get('/me',      verifyToken, isHospitalAdmin, hospitalsController.getHospitalProfile);
router.put('/profile', verifyToken, isHospitalAdmin, hospitalsController.updateHospitalProfile);

module.exports = router;