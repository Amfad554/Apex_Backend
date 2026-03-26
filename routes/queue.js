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
                    ...(department && {
                        department: { contains: department, mode: 'insensitive' },
                    }),
                },
                include: {
                    patient: { select: { id: true, fullName: true, patientNumber: true } },
                    // Include doctor relation if it exists in your schema
                    ...(prisma.queue.fields?.doctorId && {
                        doctor: { select: { id: true, fullName: true } },
                    }),
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
// Frontend sends: { patientId, doctorId, priority, reason }
// Backend schema expects: patientId, department, priority, notes
// We map: reason → department (fallback 'General') + notes; doctorId stored if schema allows
router.post('/:hospitalId', verifyToken, belongsToHospital, async (req, res) => {
    try {
        const hospitalId = parseInt(req.params.hospitalId);
        const { patientId, doctorId, priority, reason, department, notes } = req.body;

        if (!patientId || (!reason && !department)) {
            return res.status(400).json({ error: 'patientId and reason are required' });
        }

        // Map frontend "reason" to backend "department" field
        // Use reason as both the department label and notes if no separate department given
        const finalDepartment = department || reason || 'General';
        const finalNotes      = notes || reason || null;

        // Auto-increment queue number for today
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const lastEntry = await withRetry(() =>
            prisma.queue.findFirst({
                where:   { hospitalId, createdAt: { gte: today } },
                orderBy: { queueNumber: 'desc' },
            })
        );

        const queueNumber = lastEntry ? lastEntry.queueNumber + 1 : 1;

        // Build create data
        const data = {
            hospitalId,
            patientId:   parseInt(patientId),
            queueNumber,
            department:  finalDepartment,
            priority:    priority || 'normal',
            notes:       finalNotes,
            status:      'waiting',
        };

        // Add doctorId if schema supports it
        if (doctorId) {
            try { data.doctorId = parseInt(doctorId); } catch (_) {}
        }

        const entry = await withRetry(() =>
            prisma.queue.create({
                data,
                include: {
                    patient: { select: { id: true, fullName: true, patientNumber: true } },
                },
            })
        );

        // Attach doctor info manually if we stored doctorId
        let result = { ...entry, reason: finalNotes };
        if (doctorId) {
            try {
                const doc = await prisma.staff.findUnique({
                    where:  { id: parseInt(doctorId) },
                    select: { id: true, fullName: true },
                });
                result.doctor = doc;
            } catch (_) {}
        }

        return res.status(201).json({ message: 'Added to queue successfully', entry: result });
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
        if (status === 'called')       data.calledAt = new Date();
        if (status === 'in-progress')  data.servedAt = new Date();
        if (status === 'completed')    data.servedAt = new Date();

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

// ── DELETE /api/queue/:id ─────────────────────────────────────────────────────
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await withRetry(() => prisma.queue.delete({ where: { id } }));
        return res.json({ message: 'Removed from queue' });
    } catch (err) {
        console.error('[DELETE /queue/:id]', err);
        if (err.code === 'P2025') return res.status(404).json({ error: 'Queue entry not found' });
        return res.status(500).json({ error: 'Failed to remove from queue' });
    }
});

module.exports = router;