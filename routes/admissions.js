const express = require('express');
const router  = express.Router();
const { verifyToken, belongsToHospital } = require('../middleware/authMiddleware');
const admissionsController = require('../controllers/admissions.controller');

router.get(   '/:hospitalId',        verifyToken, belongsToHospital, admissionsController.getAdmissions);
router.post(  '/:hospitalId',        verifyToken, belongsToHospital, admissionsController.createAdmission);
router.patch( '/:id/discharge',      verifyToken,                    admissionsController.dischargeAdmission);
router.delete('/:id',                verifyToken,                    admissionsController.deleteAdmission);

module.exports = router;