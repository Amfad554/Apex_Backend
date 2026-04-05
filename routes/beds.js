const express = require('express');
const router  = express.Router();
const { verifyToken, belongsToHospital } = require('../middleware/authMiddleware');
const bedsController = require('../controllers/bedsController');

router.get(   '/:hospitalId',  verifyToken, belongsToHospital, bedsController.getBeds);
router.post(  '/:hospitalId',  verifyToken, belongsToHospital, bedsController.createBed);
router.patch( '/:id/status',   verifyToken,                    bedsController.updateBedStatus);

module.exports = router;