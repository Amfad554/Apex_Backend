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

        // Handle filter values like "sample_collected" sent as "sample collected"
        const normalizedStatus = status ? status.replace(' ', '_') : undefined;

        const requests = await withRetry(() =>
            prisma.labRequest.findMany({
                where: {
                    hospitalId,
                    ...(normalizedStatus && { status: normalizedStatus }),
                    ...(search && {
                        OR: [
                            { testName: { contains: search, mode: 'insensitive' } },
                            { patient: { fullName: { contains: search, mode: 'insensitive' } } },
                        ],
                    }),
                },
                include: {
                    patient:           { select: { id: true, fullName: true, patientNumber: true } },
                    requestedByStaff:  { select: { id: true, fullName: true, role: true } },
                },
                orderBy: [{ createdAt: 'desc' }],
            })
        );

        // Normalize: frontend expects r.doctor, r.urgency, r.requestNumber
        const normalized = requests.map(r => ({
            ...r,
            doctor:        r.requestedByStaff || null,
            urgency:       r.urgency || r.priority || 'routine',
            requestNumber: r.requestNumber || `LAB-${r.id}`,
        }));

        return res.json({ requests: normalized });
    } catch (err) {
        console.error('[GET /lab-requests]', err);
        return res.status(500).json({ error: 'Failed to fetch lab requests' });
    }
});

// ── POST /api/lab-requests/:hospitalId ───────────────────────────────────────
// Frontend sends: { patientId, doctorId, testName, testType, urgency, notes }
// Backend schema uses: requestedBy (staff id), priority (not urgency)
router.post('/:hospitalId', verifyToken, belongsToHospital, async (req, res) => {
    try {
        const hospitalId = parseInt(req.params.hospitalId);
        const { patientId, doctorId, testName, testType, urgency, priority, notes } = req.body;

        // Use doctorId if provided, otherwise fall back to the logged-in user
        const requestedBy = doctorId ? parseInt(doctorId) : req.user.id;
        // Accept either "urgency" (frontend) or "priority" (legacy)
        const finalPriority = urgency || priority || 'routine';

        if (!patientId || !testName) {
            return res.status(400).json({ error: 'patientId and testName are required' });
        }

        const labRequest = await withRetry(() =>
            prisma.labRequest.create({
                data: {
                    hospitalId,
                    patientId:   parseInt(patientId),
                    requestedBy,
                    testName,
                    testType:    testType || 'blood',
                    priority:    finalPriority,
                    notes:       notes || null,
                    status:      'pending',
                },
                include: {
                    patient:          { select: { id: true, fullName: true, patientNumber: true } },
                    requestedByStaff: { select: { id: true, fullName: true, role: true } },
                },
            })
        );

        // Normalize response to match frontend expectations
        const normalized = {
            ...labRequest,
            doctor:        labRequest.requestedByStaff || null,
            urgency:       labRequest.priority,
            requestNumber: labRequest.requestNumber || `LAB-${labRequest.id}`,
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
        if (result)                    data.result     = result;
        if (status === 'completed')    data.resultDate = new Date();
        if (status === 'results_ready') data.resultDate = new Date();

        const labRequest = await withRetry(() =>
            prisma.labRequest.update({
                where: { id },
                data,
                include: {
                    patient:          { select: { id: true, fullName: true, patientNumber: true } },
                    requestedByStaff: { select: { id: true, fullName: true, role: true } },
                },
            })
        );

        const normalized = {
            ...labRequest,
            doctor:        labRequest.requestedByStaff || null,
            urgency:       labRequest.priority,
            requestNumber: labRequest.requestNumber || `LAB-${labRequest.id}`,
        };

        return res.json({ message: 'Lab request status updated', labRequest: normalized });
    } catch (err) {
        console.error('[PATCH /lab-requests/:id/status]', err);
        if (err.code === 'P2025') return res.status(404).json({ error: 'Lab request not found' });
        return res.status(500).json({ error: 'Failed to update lab request status' });
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
        return res.status(500).json({ error: 'Failed to delete lab request' });
    }
});

module.exports = router;