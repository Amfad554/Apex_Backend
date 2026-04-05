const express     = require('express');
const router      = express.Router();
const rateLimit   = require('express-rate-limit');
const { verifyToken } = require('../middleware/authMiddleware');
const authController  = require('../controllers/authController');

// ─── Rate limiters ─────────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 10,
    standardHeaders: true, legacyHeaders: false,
    message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
});

const forgotLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, max: 5,
    standardHeaders: true, legacyHeaders: false,
    message: { error: 'Too many reset requests. Please try again in 1 hour.' },
});

// ─── Hospital ──────────────────────────────────────────────────────────────────
router.post('/hospital/register',        authController.hospitalRegister);
router.post('/hospital/login',           loginLimiter,   authController.hospitalLogin);
router.post('/hospital/forgot-password', forgotLimiter,  authController.hospitalForgotPassword);
router.post('/hospital/reset-password',                  authController.hospitalResetPassword);

// ─── Admin ─────────────────────────────────────────────────────────────────────
router.post('/admin/login', loginLimiter, authController.adminLogin);

// ─── Staff ─────────────────────────────────────────────────────────────────────
router.post('/staff/login',           loginLimiter, authController.staffLogin);
router.post('/staff/forgot-password',               authController.staffForgotPassword);

// ─── Shared ────────────────────────────────────────────────────────────────────
router.post('/change-password', verifyToken, authController.changePassword);

module.exports = router;