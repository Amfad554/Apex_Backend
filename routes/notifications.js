const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const {
    getNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
} = require('../controllers/notificationController');

// NOTE: /read-all must come before /:id/read to avoid route conflict
router.get('/',              verifyToken, getNotifications);
router.patch('/read-all',    verifyToken, markAllAsRead);
router.patch('/:id/read',    verifyToken, markAsRead);
router.delete('/:id',        verifyToken, deleteNotification);

module.exports = router;