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
                console.warn(`[lab-requests] DB retry (${attempt}/${retries})...`);
                await new Promise(res => setTimeout(res, delayMs));
            } else throw err;
        }
    }
}

// ── GET /api/lab-requests/:hospitalId ────────────────────────────────────────
router.get('/:hospitalId', verifyToken, belongsToHospital, async (req, res) => {
    try {
        const hospitalId = parseInt(req.params.hospitalId);
        const { status, search } = req.query;

        const normalizedStatus = status ? status.replace(' ', '_') : undefined;

        const requests = await withRetry(() =>
            prisma.labRequest.findMany({
                where: {
                    hospitalId,
                    ...(normalizedStatus && { status: normalizedStatus }),
                    ...(search && {
                        OR: [
                            { testName: { contains: search, mode: 'insensitive' } },
                            { patient:  { fullName: { contains: search, mode: 'insensitive' } } },
                        ],
                    }),
                },
                include: {
                    patient:     { select: { id: true, fullName: true, patientNumber: true } },
                    requestedBy: { select: { id: true, fullName: true, role: true } }, // ✅ schema relation name
                    processedBy: { select: { id: true, fullName: true, role: true } }, // ✅ schema relation name
                },
                orderBy: { createdAt: 'desc' },
            })
        );

        // Normalize for frontend
        const normalized = requests.map(r => ({
            ...r,
            doctor:        r.requestedBy || null,             // frontend reads .doctor
            requestNumber: `LAB-${r.id}`,                     // no requestNumber in schema, derive it
            // urgency already exists as field name in schema ✅
        }));

        return res.json({ requests: normalized });
    } catch (err) {
        console.error('[GET /lab-requests]', err);
        return res.status(500).json({ error: err.message });
    }
});

// ── POST /api/lab-requests/:hospitalId ───────────────────────────────────────
// Frontend sends: { patientId, doctorId, testName, testType, urgency, notes }
router.post('/:hospitalId', verifyToken, belongsToHospital, async (req, res) => {
    try {
        const hospitalId = parseInt(req.params.hospitalId);
        const { patientId, doctorId, testName, testType, urgency, notes } = req.body;

        // requestedById is NOT NULL in schema — use doctorId or the logged-in user
        const requestedById = doctorId ? parseInt(doctorId) : req.user.id;

        if (!patientId || !testName) {
            return res.status(400).json({ error: 'patientId and testName are required' });
        }

        const labRequest = await withRetry(() =>
            prisma.labRequest.create({
                data: {
                    hospitalId,
                    patientId:    parseInt(patientId),
                    requestedById,                           // ✅ schema field (NOT requestedBy)
                    testName,
                    testType:     testType || 'blood',
                    urgency:      urgency  || 'routine',     // ✅ schema field (NOT priority)
                    resultNotes:  notes || null,             // ✅ schema field (NOT notes)
                    status:       'pending',
                },
                include: {
                    patient:     { select: { id: true, fullName: true, patientNumber: true } },
                    requestedBy: { select: { id: true, fullName: true, role: true } },
                },
            })
        );

        const normalized = {
            ...labRequest,
            doctor:        labRequest.requestedBy || null,
            requestNumber: `LAB-${labRequest.id}`,
        };

        prisma.notification.create({
            data: {
                hospitalId,
                type:    'lab_request_created',
                title:   'New Lab Request',
                message: `Lab test "${testName}" requested for ${labRequest.patient.fullName}.`,
                link:    'lab-requests',
            },
        }).catch(err => console.error('[Notification] lab_request_created:', err.message));

        return res.status(201).json({ message: 'Lab request created successfully', labRequest: normalized });
    } catch (err) {
        console.error('[POST /lab-requests]', err);
        return res.status(500).json({ error: err.message });
    }
});

// ── PATCH /api/lab-requests/:id/status ───────────────────────────────────────
router.patch('/:id/status', verifyToken, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { status, result, resultNotes } = req.body;

        if (!status) return res.status(400).json({ error: 'status is required' });

        const data = { status };

        // ✅ schema uses `results` (Json) and `resultNotes` (String) and `completedAt`
        if (result)                      data.results     = result;
        if (resultNotes)                 data.resultNotes = resultNotes;
        if (status === 'sample_collected') data.sampleCollectedAt = new Date();
        if (status === 'completed')        data.completedAt       = new Date();

        const labRequest = await withRetry(() =>
            prisma.labRequest.update({
                where: { id },
                data,
                include: {
                    patient:     { select: { id: true, fullName: true, patientNumber: true } },
                    requestedBy: { select: { id: true, fullName: true, role: true } },
                },
            })
        );

        const normalized = {
            ...labRequest,
            doctor:        labRequest.requestedBy || null,
            requestNumber: `LAB-${labRequest.id}`,
        };

        return res.json({ message: 'Lab request status updated', labRequest: normalized });
    } catch (err) {
        console.error('[PATCH /lab-requests/:id/status]', err);
        if (err.code === 'P2025') return res.status(404).json({ error: 'Lab request not found' });
        return res.status(500).json({ error: err.message });
    }
});

// ── DELETE /api/lab-requests/:id ─────────────────────────────────────────────
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await withRetry(() => prisma.labRequest.delete({ where: { id } }));
        return res.json({ message: 'Lab request deleted' });
    } catch (err) {
        console.error('[DELETE /lab-requests/:id]', err);
        if (err.code === 'P2025') return res.status(404).json({ error: 'Lab request not found' });
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;