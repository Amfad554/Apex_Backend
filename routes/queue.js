const express = require('express');
const router = express.Router();
const { verifyToken, belongsToHospital } = require('../middleware/authMiddleware');
const { getQueue, addToQueue, updateQueueStatus, removeFromQueue } = require('../controllers/queueController');

router.get('/:hospitalId',  verifyToken, belongsToHospital, getQueue);
router.post('/:hospitalId', verifyToken, belongsToHospital, addToQueue);
router.patch('/:id/status', verifyToken,                    updateQueueStatus);
router.delete('/:id',       verifyToken,                    removeFromQueue);

module.exports = router;