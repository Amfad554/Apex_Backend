const express = require('express');
const router = express.Router();
const { verifyToken, isHospitalAdmin, belongsToHospital, requireRole } = require('../middleware/authMiddleware');
const {
    getPrescriptions,
    createPrescription,
    updatePrescription,
    deletePrescription,
} = require('../controllers/prescriptionController');

router.get('/:hospitalId', verifyToken, belongsToHospital,                          getPrescriptions);
router.post('/',           verifyToken, requireRole(['hospital_admin', 'doctor']),   createPrescription);
router.patch('/:id',       verifyToken, requireRole(['hospital_admin', 'doctor', 'pharmacist']), updatePrescription);
router.delete('/:id',      verifyToken, isHospitalAdmin,                             deletePrescription);

module.exports = router;