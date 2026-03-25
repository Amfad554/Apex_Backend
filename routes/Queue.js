const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { verifyToken, belongsToHospital } = require('../middleware/authMiddleware');

async function withRetry(fn, retries = 3, delayMs = 2000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            const isConnectionErr =
                err.message?.includes('connect') ||
                err.message?.includes('timeout') ||
                err.message?.includes('Server has closed') ||
                err.errorCode === 'P1001' ||
                err.errorCode === 'P1008' ||
                err.errorCode === 'P1017';
            if (isConnectionErr && attempt < retries) {
                console.warn(`[queue] DB retry (${attempt}/${retries})...`);
                await new Promise(res => setTimeout(res, delayMs));
            } else throw err;
        }
    }
}

// ── GET /api/queue/:hospitalId ────────────────────────────────────────────────
router.get('/:hospitalId', verifyToken, belongsToHospital, async (req, res) => {
    try {
        const hospitalId = parseInt(req.params.hospitalId);
        const { status, department } = req.query;

        const entries = await withRetry(() =>
            prisma.queue.findMany({
                where: {
                    hospitalId,
                    ...(status && { status }),
                    ...(department && { department: { contains: department, mode: 'insensitive' } }),
                },
                include: {
                    patient: { select: { id: true, fullName: true, patientNumber: true } },
                },
                orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
            })
        );

        return res.json({ queue: entries });
    } catch (err) {
        console.error('[GET /queue]', err);
        return res.status(500).json({ error: 'Failed to fetch queue' });
    }
});

// ── POST /api/queue/:hospitalId ───────────────────────────────────────────────
router.post('/:hospitalId', verifyToken, belongsToHospital, async (req, res) => {
    try {
        const hospitalId = parseInt(req.params.hospitalId);
        const { patientId, department, priority, notes } = req.body;

        if (!patientId || !department) {
            return res.status(400).json({ error: 'patientId and department are required' });
        }

        // Auto-increment queue number for today per department
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const lastEntry = await withRetry(() =>
            prisma.queue.findFirst({
                where: { hospitalId, department, createdAt: { gte: today } },
                orderBy: { queueNumber: 'desc' },
            })
        );

        const queueNumber = lastEntry ? lastEntry.queueNumber + 1 : 1;

        const entry = await withRetry(() =>
            prisma.queue.create({
                data: {
                    hospitalId,
                    patientId: parseInt(patientId),
                    queueNumber,
                    department,
                    priority: priority || 'normal',
                    notes: notes || null,
                    status: 'waiting',
                },
                include: {
                    patient: { select: { id: true, fullName: true, patientNumber: true } },
                },
            })
        );

        return res.status(201).json({ message: 'Added to queue successfully', entry });
    } catch (err) {
        console.error('[POST /queue]', err);
        return res.status(500).json({ error: 'Failed to add to queue' });
    }
});

// ── PATCH /api/queue/:id/status ───────────────────────────────────────────────
router.patch('/:id/status', verifyToken, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { status } = req.body;

        if (!status) return res.status(400).json({ error: 'status is required' });

        const data = { status };
        if (status === 'called') data.calledAt = new Date();
        if (status === 'done' || status === 'serving') data.servedAt = new Date();

        const entry = await withRetry(() =>
            prisma.queue.update({
                where: { id },
                data,
                include: {
                    patient: { select: { id: true, fullName: true, patientNumber: true } },
                },
            })
        );

        return res.json({ message: 'Queue status updated', entry });
    } catch (err) {
        console.error('[PATCH /queue/:id/status]', err);
        if (err.code === 'P2025') return res.status(404).json({ error: 'Queue entry not found' });
        return res.status(500).json({ error: 'Failed to update queue status' });
    }
});

module.exports = router;