const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const { patientLogin, changePassword, getMe } = require('../controllers/staffpatientauthController');

router.post('/patient/login',    patientLogin);
router.post('/change-password',  verifyToken, changePassword);
router.get('/me',                verifyToken, getMe);

module.exports = router;