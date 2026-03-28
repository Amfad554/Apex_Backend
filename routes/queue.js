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

        // Normalize hyphenated status from frontend → enum underscore
        const normalizedStatus = status ? status.replace('-', '_') : undefined;

        const entries = await withRetry(() =>
            prisma.queue.findMany({
                where: {
                    hospitalId,
                    ...(normalizedStatus && { status: normalizedStatus }),
                    ...(department && {
                        department: { contains: department, mode: 'insensitive' },
                    }),
                },
                include: {
                    patient: { select: { id: true, fullName: true, patientNumber: true } },
                    doctor:  { select: { id: true, fullName: true } },
                },
                orderBy: [{ priority: 'desc' }, { checkInAt: 'asc' }],
            })
        );

        // Normalize for frontend: expose queueNumber alias and reason alias
        const normalized = entries.map(e => ({
            ...e,
            queueNumber: e.ticketNumber,   // frontend reads queueNumber
            reason:      e.notes,           // frontend reads reason
            status:      e.status.replace('_', '-'), // in_progress → in-progress for frontend
        }));

        return res.json({ queue: normalized });
    } catch (err) {
        console.error('[GET /queue]', err);
        return res.status(500).json({ error: err.message });
    }
});

// ── POST /api/queue/:hospitalId ───────────────────────────────────────────────
router.post('/:hospitalId', verifyToken, belongsToHospital, async (req, res) => {
    try {
        const hospitalId = parseInt(req.params.hospitalId);
        const { patientId, doctorId, priority, reason, department, notes } = req.body;

        if (!patientId || (!reason && !department)) {
            return res.status(400).json({ error: 'patientId and reason are required' });
        }

        const finalDepartment = department || reason || 'General';
        const finalNotes      = notes || reason || null;

        // Auto-generate ticket number for today  (schema field: ticketNumber)
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const lastEntry = await withRetry(() =>
            prisma.queue.findFirst({
                where:   { hospitalId, checkInAt: { gte: today } },
                orderBy: { ticketNumber: 'desc' },
            })
        );

        // ticketNumber is a String in the schema, e.g. "001", "002"
        const nextNum     = lastEntry ? (parseInt(lastEntry.ticketNumber) || 0) + 1 : 1;
        const ticketNumber = nextNum.toString().padStart(3, '0');

        const entry = await withRetry(() =>
            prisma.queue.create({
                data: {
                    hospitalId,
                    patientId:    parseInt(patientId),
                    ticketNumber,                           // ✅ schema field
                    department:   finalDepartment,
                    priority:     priority || 'normal',
                    notes:        finalNotes,
                    status:       'waiting',
                    ...(doctorId && { doctorId: parseInt(doctorId) }), // ✅ field exists in schema
                },
                include: {
                    patient: { select: { id: true, fullName: true, patientNumber: true } },
                    doctor:  { select: { id: true, fullName: true } },
                },
            })
        );

        const result = {
            ...entry,
            queueNumber: entry.ticketNumber,
            reason:      entry.notes,
            status:      entry.status.replace('_', '-'),
        };

        return res.status(201).json({ message: 'Added to queue successfully', entry: result });
    } catch (err) {
        console.error('[POST /queue]', err);
        return res.status(500).json({ error: err.message });
    }
});

// ── PATCH /api/queue/:id/status ───────────────────────────────────────────────
router.patch('/:id/status', verifyToken, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        let { status } = req.body;

        if (!status) return res.status(400).json({ error: 'status is required' });

        // Normalize frontend hyphen → DB underscore  (in-progress → in_progress)
        const dbStatus = status.replace('-', '_');

        const data = { status: dbStatus };
        if (dbStatus === 'called')       data.calledAt    = new Date();
        if (dbStatus === 'completed')    data.completedAt = new Date(); // ✅ schema field
        if (dbStatus === 'in_progress')  {}                              // no timestamp for this

        const entry = await withRetry(() =>
            prisma.queue.update({
                where: { id },
                data,
                include: {
                    patient: { select: { id: true, fullName: true, patientNumber: true } },
                    doctor:  { select: { id: true, fullName: true } },
                },
            })
        );

        const result = {
            ...entry,
            queueNumber: entry.ticketNumber,
            reason:      entry.notes,
            status:      entry.status.replace('_', '-'),
        };

        return res.json({ message: 'Queue status updated', entry: result });
    } catch (err) {
        console.error('[PATCH /queue/:id/status]', err);
        if (err.code === 'P2025') return res.status(404).json({ error: 'Queue entry not found' });
        return res.status(500).json({ error: err.message });
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
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;