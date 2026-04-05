const express = require('express');
const router = express.Router();
const { verifyToken, isHospitalAdmin, belongsToHospital } = require('../middleware/authMiddleware');
const { getRecords, createRecord, deleteRecord } = require('../controllers/recordController');

router.get('/:hospitalId', verifyToken, belongsToHospital, getRecords);
router.post('/',           verifyToken,                    createRecord);
router.delete('/:id',      verifyToken, isHospitalAdmin,   deleteRecord);

module.exports = router;