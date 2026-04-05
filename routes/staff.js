const express = require('express');
const router = express.Router();
const { verifyToken, isHospitalAdmin, belongsToHospital } = require('../middleware/authMiddleware');
const { getStaff, createStaff, updateStaffStatus, deleteStaff } = require('../controllers/staffController');

router.get('/:hospitalId',   verifyToken, belongsToHospital, getStaff);
router.post('/',             verifyToken, isHospitalAdmin,   createStaff);
router.patch('/:id/status',  verifyToken, isHospitalAdmin,   updateStaffStatus);
router.delete('/:id',        verifyToken, isHospitalAdmin,   deleteStaff);

module.exports = router;