const express = require('express');
const router  = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const { verifyPayment, getPaymentSubscription } = require('../controllers/paymentController');

router.post('/verify',       verifyToken, verifyPayment);
router.get('/subscription',  verifyToken, getPaymentSubscription);

module.exports = router;