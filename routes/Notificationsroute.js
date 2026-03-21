// Add to your backend — routes/notifications.js
const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { verifyToken } = require('../middleware/authMiddleware');

// ── GET /api/notifications — fetch for current user ───────────────────────────
router.get('/', verifyToken, async (req, res) => {
    try {
        const { id, role, hospital_id } = req.user;

        // Build the where clause based on who is asking
        const where = {
            OR: [
                { recipientId: id, recipientRole: role },
                // Hospital-wide notifications (no specific recipient)
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
});

// ── PATCH /api/notifications/:id/read — mark one as read ─────────────────────
router.patch('/:id/read', verifyToken, async (req, res) => {
    try {
        await prisma.notification.update({
            where: { id: parseInt(req.params.id) },
            data: { read: true },
        });
        return res.json({ success: true });
    } catch (err) {
        console.error('[PATCH /notifications/:id/read]', err);
        return res.status(500).json({ error: 'Failed to mark as read' });
    }
});

// ── PATCH /api/notifications/read-all — mark all as read ─────────────────────
router.patch('/read-all', verifyToken, async (req, res) => {
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
});

// ── DELETE /api/notifications/:id — delete one ────────────────────────────────
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        await prisma.notification.delete({ where: { id: parseInt(req.params.id) } });
        return res.json({ success: true });
    } catch (err) {
        console.error('[DELETE /notifications/:id]', err);
        return res.status(500).json({ error: 'Failed to delete notification' });
    }
});

module.exports = router;


// ════════════════════════════════════════════════════════════════
// PRISMA SCHEMA ADDITION — add to schema.prisma
// ════════════════════════════════════════════════════════════════
/*
model Notification {
  id            Int       @id @default(autoincrement())
  hospitalId    Int?      @map("hospital_id")
  recipientId   Int?      @map("recipient_id")
  recipientRole String?   @map("recipient_role")
  type          String    // 'patient_registered' | 'appointment_booked' | 'prescription_issued' | 'staff_added' | 'info'
  title         String
  message       String
  link          String?   // which section to navigate to e.g. 'patients'
  read          Boolean   @default(false)
  createdAt     DateTime  @default(now()) @map("created_at")

  @@index([hospitalId])
  @@index([recipientId])
  @@map("notifications")
}

Then run: npx prisma db push
*/

// ════════════════════════════════════════════════════════════════
// HELPER — call this whenever you want to create a notification
// e.g. after patient registered, appointment booked, etc.
// ════════════════════════════════════════════════════════════════
/*
await prisma.notification.create({
  data: {
    hospitalId:    hospitalId,
    recipientId:   null,         // null = all staff in hospital see it
    recipientRole: null,
    type:          'patient_registered',
    title:         'New Patient Registered',
    message:       `${fullName} has been registered as a new patient.`,
    link:          'patients',
  },
});
*/