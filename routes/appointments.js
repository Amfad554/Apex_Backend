const express = require('express');
const router  = express.Router();
const { verifyToken, isHospitalAdmin, belongsToHospital, requireRole } = require('../middleware/authMiddleware');
const appointmentsController = require('../controllers/appoitmentController');

router.get(   '/:hospitalId', verifyToken, belongsToHospital, appointmentsController.getAppointments);
router.post(  '/',            verifyToken,                    appointmentsController.createAppointment);
router.patch( '/:id/status',  verifyToken, requireRole(['hospital_admin', 'doctor', 'nurse', 'receptionist']), appointmentsController.updateAppointmentStatus);
router.delete('/:id',         verifyToken, isHospitalAdmin,  appointmentsController.deleteAppointment);

module.exports = router;