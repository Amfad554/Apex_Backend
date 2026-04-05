const express = require('express');
const router = express.Router();
const { getPlatformStats } = require('../controllers/platformController');

// ─── GET /api/platform/stats ──────────────────────────────────────────────────
router.get('/stats', getPlatformStats);

module.exports = router;