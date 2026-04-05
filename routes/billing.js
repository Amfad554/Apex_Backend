const express = require('express');
const router  = express.Router();
const { verifyToken, belongsToHospital } = require('../middleware/authMiddleware');
const billingController = require('../controllers/billing.controller');

router.get(   '/:hospitalId',  verifyToken, belongsToHospital, billingController.getBills);
router.post(  '/:hospitalId',  verifyToken, belongsToHospital, billingController.createBill);
router.post(  '/:id/payment',  verifyToken,                    billingController.recordPayment);
router.delete('/:id',          verifyToken,                    billingController.deleteBill);

module.exports = router;