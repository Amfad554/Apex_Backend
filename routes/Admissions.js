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
                console.warn(`[admissions] DB retry (${attempt}/${retries})...`);
                await new Promise(res => setTimeout(res, delayMs));
            } else throw err;
        }
    }
}

// ── GET /api/admissions/:hospitalId ──────────────────────────────────────────
router.get('/:hospitalId', verifyToken, belongsToHospital, async (req, res) => {
    try {
        const hospitalId = parseInt(req.params.hospitalId);
        const { status, search } = req.query;

        const admissions = await withRetry(() =>
            prisma.admission.findMany({
                where: {
                    hospitalId,
                    ...(status && { status }),
                    ...(search && {
                        patient: { fullName: { contains: search, mode: 'insensitive' } },
                    }),
                },
                include: {
                    patient: { select: { id: true, fullName: true, patientNumber: true, phone: true } },
                    bed: { select: { id: true, bedNumber: true, ward: true } },
                },
                orderBy: { createdAt: 'desc' },
            })
        );

        return res.json({ admissions });
    } catch (err) {
        console.error('[GET /admissions]', err);
        return res.status(500).json({ error: 'Failed to fetch admissions' });
    }
});

// ── POST /api/admissions/:hospitalId ─────────────────────────────────────────
router.post('/:hospitalId', verifyToken, belongsToHospital, async (req, res) => {
    try {
        const hospitalId = parseInt(req.params.hospitalId);
        const { patientId, bedId, reason, notes } = req.body;

        if (!patientId || !reason) {
            return res.status(400).json({ error: 'patientId and reason are required' });
        }

        // If a bed is assigned, mark it occupied
        if (bedId) {
            const bed = await withRetry(() => prisma.bed.findFirst({ where: { id: parseInt(bedId), hospitalId } }));
            if (!bed) return res.status(404).json({ error: 'Bed not found' });
            if (bed.status === 'occupied') return res.status(409).json({ error: 'Bed is already occupied' });

            await withRetry(() => prisma.bed.update({ where: { id: parseInt(bedId) }, data: { status: 'occupied' } }));
        }

        const admission = await withRetry(() =>
            prisma.admission.create({
                data: {
                    hospitalId,
                    patientId: parseInt(patientId),
                    bedId: bedId ? parseInt(bedId) : null,
                    reason,
                    notes: notes || null,
                    status: 'admitted',
                },
                include: {
                    patient: { select: { id: true, fullName: true, patientNumber: true, phone: true } },
                    bed: { select: { id: true, bedNumber: true, ward: true } },
                },
            })
        );

        prisma.notification.create({
            data: {
                hospitalId,
                type: 'patient_admitted',
                title: 'Patient Admitted',
                message: `${admission.patient.fullName} has been admitted.`,
                link: 'admissions',
            },
        }).catch(err => console.error('[Notification] patient_admitted:', err.message));

        return res.status(201).json({ message: 'Patient admitted successfully', admission });
    } catch (err) {
        console.error('[POST /admissions]', err);
        return res.status(500).json({ error: 'Failed to create admission' });
    }
});

// ── PATCH /api/admissions/:id/discharge ──────────────────────────────────────
router.patch('/:id/discharge', verifyToken, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { notes } = req.body;

        const existing = await withRetry(() =>
            prisma.admission.findUnique({ where: { id }, include: { bed: true } })
        );
        if (!existing) return res.status(404).json({ error: 'Admission not found' });
        if (existing.status === 'discharged') return res.status(409).json({ error: 'Patient already discharged' });

        // Free the bed
        if (existing.bedId) {
            await withRetry(() =>
                prisma.bed.update({ where: { id: existing.bedId }, data: { status: 'available' } })
            );
        }

        const admission = await withRetry(() =>
            prisma.admission.update({
                where: { id },
                data: {
                    status: 'discharged',
                    dischargeDate: new Date(),
                    notes: notes || existing.notes,
                },
                include: {
                    patient: { select: { id: true, fullName: true, patientNumber: true } },
                    bed: { select: { id: true, bedNumber: true, ward: true } },
                },
            })
        );

        return res.json({ message: 'Patient discharged successfully', admission });
    } catch (err) {
        console.error('[PATCH /admissions/:id/discharge]', err);
        return res.status(500).json({ error: 'Failed to discharge patient' });
    }
});

module.exports = router; 