const prisma = require('../lib/prisma');

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

const normalizeEntry = (e) => ({
    ...e,
    queueNumber: e.ticketNumber,
    reason:      e.notes,
    status:      e.status.replace('_', '-'),
});

// ── GET /api/queue/:hospitalId ────────────────────────────────────────────────
const getQueue = async (req, res) => {
    try {
        const hospitalId      = parseInt(req.params.hospitalId);
        const { status, department } = req.query;

        const normalizedStatus = status ? status.replace('-', '_') : undefined;

        const entries = await withRetry(() =>
            prisma.queue.findMany({
                where: {
                    hospitalId,
                    ...(normalizedStatus && { status: normalizedStatus }),
                    ...(department && { department: { contains: department, mode: 'insensitive' } }),
                },
                include: {
                    patient: { select: { id: true, fullName: true, patientNumber: true } },
                    doctor:  { select: { id: true, fullName: true } },
                },
                orderBy: [{ priority: 'desc' }, { checkInAt: 'asc' }],
            })
        );

        return res.json({ queue: entries.map(normalizeEntry) });
    } catch (err) {
        console.error('[GET /queue]', err);
        return res.status(500).json({ error: err.message });
    }
};

// ── POST /api/queue/:hospitalId ───────────────────────────────────────────────
const addToQueue = async (req, res) => {
    try {
        const hospitalId = parseInt(req.params.hospitalId);
        const { patientId, doctorId, priority, reason, department, notes } = req.body;

        if (!patientId || (!reason && !department)) {
            return res.status(400).json({ error: 'patientId and reason are required' });
        }

        const finalDepartment = department || reason || 'General';
        const finalNotes      = notes || reason || null;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const lastEntry = await withRetry(() =>
            prisma.queue.findFirst({
                where:   { hospitalId, checkInAt: { gte: today } },
                orderBy: { ticketNumber: 'desc' },
            })
        );

        const nextNum      = lastEntry ? (parseInt(lastEntry.ticketNumber) || 0) + 1 : 1;
        const ticketNumber = nextNum.toString().padStart(3, '0');

        const entry = await withRetry(() =>
            prisma.queue.create({
                data: {
                    hospitalId,
                    patientId:  parseInt(patientId),
                    ticketNumber,
                    department: finalDepartment,
                    priority:   priority || 'normal',
                    notes:      finalNotes,
                    status:     'waiting',
                    ...(doctorId && { doctorId: parseInt(doctorId) }),
                },
                include: {
                    patient: { select: { id: true, fullName: true, patientNumber: true } },
                    doctor:  { select: { id: true, fullName: true } },
                },
            })
        );

        return res.status(201).json({ message: 'Added to queue successfully', entry: normalizeEntry(entry) });
    } catch (err) {
        console.error('[POST /queue]', err);
        return res.status(500).json({ error: err.message });
    }
};

// ── PATCH /api/queue/:id/status ───────────────────────────────────────────────
const updateQueueStatus = async (req, res) => {
    try {
        const id       = parseInt(req.params.id);
        const { status } = req.body;

        if (!status) return res.status(400).json({ error: 'status is required' });

        const dbStatus = status.replace('-', '_');

        const data = { status: dbStatus };
        if (dbStatus === 'called')      data.calledAt    = new Date();
        if (dbStatus === 'completed')   data.completedAt = new Date();

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

        return res.json({ message: 'Queue status updated', entry: normalizeEntry(entry) });
    } catch (err) {
        console.error('[PATCH /queue/:id/status]', err);
        if (err.code === 'P2025') return res.status(404).json({ error: 'Queue entry not found' });
        return res.status(500).json({ error: err.message });
    }
};

// ── DELETE /api/queue/:id ─────────────────────────────────────────────────────
const removeFromQueue = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await withRetry(() => prisma.queue.delete({ where: { id } }));
        return res.json({ message: 'Removed from queue' });
    } catch (err) {
        console.error('[DELETE /queue/:id]', err);
        if (err.code === 'P2025') return res.status(404).json({ error: 'Queue entry not found' });
        return res.status(500).json({ error: err.message });
    }
};

module.exports = { getQueue, addToQueue, updateQueueStatus, removeFromQueue };