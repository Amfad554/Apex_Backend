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

        const requests = await withRetry(() =>
            prisma.labRequest.findMany({
                where: {
                    hospitalId,
                    ...(status && { status }),
                    ...(search && {
                        OR: [
                            { testName: { contains: search, mode: 'insensitive' } },
                            { patient: { fullName: { contains: search, mode: 'insensitive' } } },
                        ],
                    }),
                },
                include: {
                    patient: { select: { id: true, fullName: true, patientNumber: true } },
                    requestedByStaff: { select: { id: true, fullName: true, role: true } },
                },
                orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
            })
        );

        return res.json({ requests });
    } catch (err) {
        console.error('[GET /lab-requests]', err);
        return res.status(500).json({ error: 'Failed to fetch lab requests' });
    }
});

// ── POST /api/lab-requests/:hospitalId ───────────────────────────────────────
router.post('/:hospitalId', verifyToken, belongsToHospital, async (req, res) => {
    try {
        const hospitalId = parseInt(req.params.hospitalId);
        const { patientId, testName, testType, priority, notes } = req.body;
        const requestedBy = req.user.id;

        if (!patientId || !testName || !testType) {
            return res.status(400).json({ error: 'patientId, testName, and testType are required' });
        }

        const labRequest = await withRetry(() =>
            prisma.labRequest.create({
                data: {
                    hospitalId,
                    patientId: parseInt(patientId),
                    requestedBy,
                    testName,
                    testType,
                    priority: priority || 'normal',
                    notes: notes || null,
                    status: 'pending',
                },
                include: {
                    patient: { select: { id: true, fullName: true, patientNumber: true } },
                    requestedByStaff: { select: { id: true, fullName: true, role: true } },
                },
            })
        );

        prisma.notification.create({
            data: {
                hospitalId,
                type: 'lab_request_created',
                title: 'New Lab Request',
                message: `Lab test "${testName}" requested for ${labRequest.patient.fullName}.`,
                link: 'lab-requests',
            },
        }).catch(err => console.error('[Notification] lab_request_created:', err.message));

        return res.status(201).json({ message: 'Lab request created successfully', labRequest });
    } catch (err) {
        console.error('[POST /lab-requests]', err);
        return res.status(500).json({ error: 'Failed to create lab request' });
    }
});

// ── PATCH /api/lab-requests/:id/status ───────────────────────────────────────
router.patch('/:id/status', verifyToken, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { status, result } = req.body;

        if (!status) return res.status(400).json({ error: 'status is required' });

        const data = { status };
        if (result) data.result = result;
        if (status === 'completed') data.resultDate = new Date();

        const labRequest = await withRetry(() =>
            prisma.labRequest.update({
                where: { id },
                data,
                include: {
                    patient: { select: { id: true, fullName: true, patientNumber: true } },
                    requestedByStaff: { select: { id: true, fullName: true, role: true } },
                },
            })
        );

        return res.json({ message: 'Lab request status updated', labRequest });
    } catch (err) {
        console.error('[PATCH /lab-requests/:id/status]', err);
        if (err.code === 'P2025') return res.status(404).json({ error: 'Lab request not found' });
        return res.status(500).json({ error: 'Failed to update lab request status' });
    }
});

module.exports = router;