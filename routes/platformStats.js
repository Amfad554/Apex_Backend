const express = require('express');
const router = express.Router();
const { getPlatformStats } = require('../controllers/platformstatsController');

// ─── GET /api/platform/stats ──────────────────────────────────────────────────
router.get('/stats', getPlatformStats);

module.exports = router;