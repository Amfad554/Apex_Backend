const express = require('express');
const router = express.Router();
const { verifyToken, belongsToHospital } = require('../middleware/authMiddleware');
const {
    getLabRequests,
    createLabRequest,
    updateLabRequestStatus,
    deleteLabRequest,
} = require('../controllers/labrequestController');

router.get('/:hospitalId',      verifyToken, belongsToHospital, getLabRequests);
router.post('/:hospitalId',     verifyToken, belongsToHospital, createLabRequest);
router.patch('/:id/status',     verifyToken,                    updateLabRequestStatus);
router.delete('/:id',           verifyToken,                    deleteLabRequest);

module.exports = router;