const prisma = require('../lib/prisma');

// ── GET /api/notifications ────────────────────────────────────────────────────
const getNotifications = async (req, res) => {
    try {
        const { id, role, hospital_id } = req.user;

        const where = {
            OR: [
                { recipientId: id, recipientRole: role },
                ...(hospital_id ? [{ hospitalId: hospital_id, recipientId: null }] : []),
            ],
        };

        const notifications = await prisma.notification.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 50,
        });

        const unreadCount = notifications.filter(n => !n.read).length;
        return res.json({ notifications, unreadCount });
    } catch (err) {
        console.error('[GET /notifications]', err);
        return res.status(500).json({ error: 'Failed to fetch notifications' });
    }
};

// ── PATCH /api/notifications/:id/read ────────────────────────────────────────
const markAsRead = async (req, res) => {
    try {
        await prisma.notification.update({
            where: { id: parseInt(req.params.id) },
            data:  { read: true },
        });
        return res.json({ success: true });
    } catch (err) {
        console.error('[PATCH /notifications/:id/read]', err);
        return res.status(500).json({ error: 'Failed to mark as read' });
    }
};

// ── PATCH /api/notifications/read-all ────────────────────────────────────────
const markAllAsRead = async (req, res) => {
    try {
        const { id, role, hospital_id } = req.user;

        await prisma.notification.updateMany({
            where: {
                OR: [
                    { recipientId: id, recipientRole: role },
                    ...(hospital_id ? [{ hospitalId: hospital_id, recipientId: null }] : []),
                ],
                read: false,
            },
            data: { read: true },
        });
        return res.json({ success: true });
    } catch (err) {
        console.error('[PATCH /notifications/read-all]', err);
        return res.status(500).json({ error: 'Failed to mark all as read' });
    }
};

// ── DELETE /api/notifications/:id ─────────────────────────────────────────────
const deleteNotification = async (req, res) => {
    try {
        await prisma.notification.delete({ where: { id: parseInt(req.params.id) } });
        return res.json({ success: true });
    } catch (err) {
        console.error('[DELETE /notifications/:id]', err);
        return res.status(500).json({ error: 'Failed to delete notification' });
    }
};

module.exports = {
    getNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
};