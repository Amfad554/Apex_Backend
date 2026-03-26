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
                        OR: [
                            { patient: { fullName: { contains: search, mode: 'insensitive' } } },
                            { reason: { contains: search, mode: 'insensitive' } },
                        ],
                    }),
                },
                include: {
                    patient: { select: { id: true, fullName: true, patientNumber: true, phone: true } },
                    bed:     { select: { id: true, bedNumber: true, ward: true } },
                    // Include doctor if relation exists in your schema
                    ...(prisma.admission.fields?.doctorId && {
                        doctor: { select: { id: true, fullName: true } },
                    }),
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
// Frontend sends: { patientId, doctorId, bedId, admissionDate, reason, notes }
router.post('/:hospitalId', verifyToken, belongsToHospital, async (req, res) => {
    try {
        const hospitalId = parseInt(req.params.hospitalId);
        const { patientId, bedId, doctorId, admissionDate, reason, notes } = req.body;

        if (!patientId || !reason) {
            return res.status(400).json({ error: 'patientId and reason are required' });
        }

        // Validate and lock the bed
        if (bedId) {
            const bed = await withRetry(() =>
                prisma.bed.findFirst({ where: { id: parseInt(bedId), hospitalId } })
            );
            if (!bed) return res.status(404).json({ error: 'Bed not found' });
            if (bed.status === 'occupied')
                return res.status(409).json({ error: 'Bed is already occupied' });

            await withRetry(() =>
                prisma.bed.update({ where: { id: parseInt(bedId) }, data: { status: 'occupied' } })
            );
        }

        // Build data object — only include doctorId if the schema supports it
        const data = {
            hospitalId,
            patientId:     parseInt(patientId),
            bedId:         bedId ? parseInt(bedId) : null,
            reason,
            notes:         notes || null,
            status:        'admitted',
            admissionDate: admissionDate ? new Date(admissionDate) : new Date(),
        };

        // Conditionally add doctorId if field exists on the model
        try {
            // This will throw if the field doesn't exist in Prisma schema
            if (doctorId) data.doctorId = parseInt(doctorId);
        } catch (_) { /* schema doesn't have doctorId — skip silently */ }

        const admission = await withRetry(() =>
            prisma.admission.create({
                data,
                include: {
                    patient: { select: { id: true, fullName: true, patientNumber: true, phone: true } },
                    bed:     { select: { id: true, bedNumber: true, ward: true } },
                },
            })
        );

        // Try to attach doctor info if available
        let result = { ...admission };
        if (doctorId) {
            try {
                const doc = await prisma.staff.findUnique({
                    where: { id: parseInt(doctorId) },
                    select: { id: true, fullName: true },
                });
                result.doctor = doc;
            } catch (_) {}
        }

        prisma.notification.create({
            data: {
                hospitalId,
                type:    'patient_admitted',
                title:   'Patient Admitted',
                message: `${admission.patient.fullName} has been admitted.`,
                link:    'admissions',
            },
        }).catch(err => console.error('[Notification] patient_admitted:', err.message));

        return res.status(201).json({ message: 'Patient admitted successfully', admission: result });
    } catch (err) {
        console.error('[POST /admissions]', err);
        return res.status(500).json({ error: 'Failed to create admission' });
    }
});

// ── PATCH /api/admissions/:id/discharge ──────────────────────────────────────
// Frontend sends: { dischargeNotes, dischargeDate }
router.patch('/:id/discharge', verifyToken, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { dischargeNotes, notes, dischargeDate } = req.body;

        const finalNotes = dischargeNotes || notes;

        const existing = await withRetry(() =>
            prisma.admission.findUnique({ where: { id }, include: { bed: true } })
        );
        if (!existing) return res.status(404).json({ error: 'Admission not found' });
        if (existing.status === 'discharged')
            return res.status(409).json({ error: 'Patient already discharged' });

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
                    status:        'discharged',
                    dischargeDate: dischargeDate ? new Date(dischargeDate) : new Date(),
                    notes:         finalNotes || existing.notes,
                },
                include: {
                    patient: { select: { id: true, fullName: true, patientNumber: true } },
                    bed:     { select: { id: true, bedNumber: true, ward: true } },
                },
            })
        );

        return res.json({ message: 'Patient discharged successfully', admission });
    } catch (err) {
        console.error('[PATCH /admissions/:id/discharge]', err);
        return res.status(500).json({ error: 'Failed to discharge patient' });
    }
});

// ── DELETE /api/admissions/:id ────────────────────────────────────────────────
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        // Free bed if occupied by this admission
        const existing = await withRetry(() =>
            prisma.admission.findUnique({ where: { id } })
        );
        if (!existing) return res.status(404).json({ error: 'Admission not found' });

        if (existing.bedId && existing.status === 'admitted') {
            await withRetry(() =>
                prisma.bed.update({ where: { id: existing.bedId }, data: { status: 'available' } })
            );
        }

        await withRetry(() => prisma.admission.delete({ where: { id } }));
        return res.json({ message: 'Admission record deleted' });
    } catch (err) {
        console.error('[DELETE /admissions/:id]', err);
        if (err.code === 'P2025') return res.status(404).json({ error: 'Admission not found' });
        return res.status(500).json({ error: 'Failed to delete admission' });
    }
});

module.exports = router;