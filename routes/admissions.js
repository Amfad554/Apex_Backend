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
                            { patient:        { fullName:        { contains: search, mode: 'insensitive' } } },
                            { admissionReason:{ contains: search, mode: 'insensitive' } }, // ✅ schema field
                        ],
                    }),
                },
                include: {
                    patient:    { select: { id: true, fullName: true, patientNumber: true, phone: true } },
                    bed:        { select: { id: true, bedNumber: true, ward: true } },
                    admittedBy: { select: { id: true, fullName: true } }, // ✅ schema relation
                },
                orderBy: { createdAt: 'desc' },
            })
        );

        // Normalize: frontend expects .reason, .notes, .admissionDate, .doctor, .dischargeDate
        const normalized = admissions.map(a => ({
            ...a,
            reason:        a.admissionReason,                     // ✅
            admissionDate: a.admittedAt,                          // ✅
            dischargeDate: a.dischargedAt,                        // ✅
            notes:         a.dischargeNotes,                      // ✅
            doctor:        a.admittedBy || null,
        }));

        return res.json({ admissions: normalized });
    } catch (err) {
        console.error('[GET /admissions]', err);
        return res.status(500).json({ error: err.message });
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

        const admission = await withRetry(() =>
            prisma.admission.create({
                data: {
                    hospitalId,
                    patientId:       parseInt(patientId),
                    bedId:           bedId ? parseInt(bedId) : null,
                    admittedById:    doctorId ? parseInt(doctorId) : null, // ✅ schema field
                    admissionReason: reason,                                // ✅ schema field
                    diagnosis:       notes || null,                         // ✅ closest schema field
                    status:          'admitted',
                    admittedAt:      admissionDate ? new Date(admissionDate) : new Date(), // ✅ schema field
                },
                include: {
                    patient:    { select: { id: true, fullName: true, patientNumber: true, phone: true } },
                    bed:        { select: { id: true, bedNumber: true, ward: true } },
                    admittedBy: { select: { id: true, fullName: true } },
                },
            })
        );

        const result = {
            ...admission,
            reason:        admission.admissionReason,
            admissionDate: admission.admittedAt,
            doctor:        admission.admittedBy || null,
        };

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
        return res.status(500).json({ error: err.message });
    }
});

// ── PATCH /api/admissions/:id/discharge ──────────────────────────────────────
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
                    status:         'discharged',
                    dischargedAt:   dischargeDate ? new Date(dischargeDate) : new Date(), // ✅ schema field
                    dischargeNotes: finalNotes || existing.dischargeNotes,                // ✅ schema field
                },
                include: {
                    patient:    { select: { id: true, fullName: true, patientNumber: true } },
                    bed:        { select: { id: true, bedNumber: true, ward: true } },
                    admittedBy: { select: { id: true, fullName: true } },
                },
            })
        );

        const result = {
            ...admission,
            reason:        admission.admissionReason,
            admissionDate: admission.admittedAt,
            dischargeDate: admission.dischargedAt,
            doctor:        admission.admittedBy || null,
        };

        return res.json({ message: 'Patient discharged successfully', admission: result });
    } catch (err) {
        console.error('[PATCH /admissions/:id/discharge]', err);
        return res.status(500).json({ error: err.message });
    }
});

// ── DELETE /api/admissions/:id ────────────────────────────────────────────────
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        const id = parseInt(req.params.id);

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
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;