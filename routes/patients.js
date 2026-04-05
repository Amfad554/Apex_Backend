const express = require('express');
const router = express.Router();
const { verifyToken, isHospitalAdmin, belongsToHospital } = require('../middleware/authMiddleware');
const {
    loginPatient,
    getPatientDetail,
    createPatient,
    getPatients,
    deletePatient,
} = require('../controllers/patientController');

// NOTE: specific paths must come before /:hospitalId to avoid route conflicts
router.post('/login',       loginPatient);
router.get('/detail/:id',   verifyToken,                   getPatientDetail);
router.post('/',            verifyToken, isHospitalAdmin,   createPatient);
router.get('/:hospitalId',  verifyToken, belongsToHospital, getPatients);
router.delete('/:id',       verifyToken, isHospitalAdmin,   deletePatient);

module.exports = router;