const prisma = require('../lib/prisma');

// ── GET /api/prescriptions/:hospitalId ───────────────────────────────────────
const getPrescriptions = async (req, res) => {
    try {
        const hospitalId = parseInt(req.params.hospitalId);
        const { status, patientId, doctorId, page = '1', limit = '25' } = req.query;

        const take = Math.min(parseInt(limit), 100);
        const skip = (Math.max(parseInt(page), 1) - 1) * take;

        const where = {
            hospitalId,
            ...(status    && { status }),
            ...(patientId && { patientId: parseInt(patientId) }),
            ...(doctorId  && { doctorId:  parseInt(doctorId) }),
        };

        const [prescriptions, total] = await Promise.all([
            prisma.prescription.findMany({
                where,
                include: {
                    patient: { select: { id: true, fullName: true, patientNumber: true } },
                    doctor:  { select: { id: true, fullName: true } },
                },
                orderBy: { createdAt: 'desc' },
                take,
                skip,
            }),
            prisma.prescription.count({ where }),
        ]);

        return res.json({ prescriptions, total, page: parseInt(page), limit: take });
    } catch (err) {
        console.error('[GET /prescriptions]', err);
        return res.status(500).json({ error: 'Failed to fetch prescriptions.' });
    }
};

// ── POST /api/prescriptions ───────────────────────────────────────────────────
const createPrescription = async (req, res) => {
    try {
        const { patientId, doctorId, medication, dosage, duration, instructions, refills } = req.body;
        const hospitalId = req.user.hospital_id;

        if (!patientId || !doctorId || !medication?.trim() || !dosage?.trim() || !duration?.trim()) {
            return res.status(400).json({ error: 'patientId, doctorId, medication, dosage and duration are required.' });
        }

        const [patient, doctor] = await Promise.all([
            prisma.patient.findFirst({ where: { id: parseInt(patientId), hospitalId } }),
            prisma.hospitalStaff.findFirst({ where: { id: parseInt(doctorId), hospitalId } }),
        ]);

        if (!patient) return res.status(404).json({ error: 'Patient not found in your hospital.' });
        if (!doctor)  return res.status(404).json({ error: 'Doctor not found in your hospital.' });

        const prescription = await prisma.prescription.create({
            data: {
                hospitalId,
                patientId:      parseInt(patientId),
                doctorId:       parseInt(doctorId),
                medication:     medication.trim(),
                dosage:         dosage.trim(),
                duration:       duration.trim(),
                instructions:   instructions?.trim() || null,
                refills:        parseInt(refills) || 0,
                status:         'active',
                prescribedDate: new Date(),
            },
            include: {
                patient: { select: { fullName: true, patientNumber: true } },
                doctor:  { select: { fullName: true } },
            },
        });

        prisma.notification.create({
            data: {
                hospitalId,
                recipientId:   null,
                recipientRole: null,
                type:    'prescription_issued',
                title:   'Prescription Issued',
                message: `Dr. ${prescription.doctor.fullName} issued ${medication.trim()} for ${prescription.patient.fullName}.`,
                link:    'prescriptions',
            },
        }).catch(err => console.error('[Notification] prescription_issued:', err.message));

        return res.status(201).json({ message: 'Prescription issued successfully.', prescription });
    } catch (err) {
        console.error('[POST /prescriptions]', err);
        return res.status(500).json({ error: 'Failed to issue prescription.' });
    }
};

// ── PATCH /api/prescriptions/:id ─────────────────────────────────────────────
const updatePrescription = async (req, res) => {
    try {
        const id         = parseInt(req.params.id);
        const hospitalId = req.user.hospital_id;
        const { status } = req.body;

        const validStatuses = ['active', 'completed', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
        }

        const prescription = await prisma.prescription.findFirst({ where: { id, hospitalId } });
        if (!prescription) return res.status(404).json({ error: 'Prescription not found.' });

        const updated = await prisma.prescription.update({
            where: { id },
            data:  { status },
            include: {
                patient: { select: { fullName: true } },
                doctor:  { select: { fullName: true } },
            },
        });

        return res.json({ message: `Prescription marked as ${status}.`, prescription: updated });
    } catch (err) {
        console.error('[PATCH /prescriptions]', err);
        return res.status(500).json({ error: 'Failed to update prescription.' });
    }
};

// ── DELETE /api/prescriptions/:id ────────────────────────────────────────────
const deletePrescription = async (req, res) => {
    try {
        const id         = parseInt(req.params.id);
        const hospitalId = req.user.hospital_id;

        const prescription = await prisma.prescription.findFirst({ where: { id, hospitalId } });
        if (!prescription) return res.status(404).json({ error: 'Prescription not found.' });

        await prisma.prescription.delete({ where: { id } });
        return res.json({ message: 'Prescription deleted successfully.' });
    } catch (err) {
        console.error('[DELETE /prescriptions]', err);
        return res.status(500).json({ error: 'Failed to delete prescription.' });
    }
};

module.exports = {
    getPrescriptions,
    createPrescription,
    updatePrescription,
    deletePrescription,
};