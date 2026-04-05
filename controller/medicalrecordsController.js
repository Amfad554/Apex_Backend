const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ── GET /api/records/:hospitalId ──────────────────────────────────────────────
const getRecords = async (req, res) => {
    try {
        const hospitalId = parseInt(req.params.hospitalId);
        const { patientId, recordType } = req.query;

        const records = await prisma.medicalRecord.findMany({
            where: {
                hospitalId,
                ...(patientId  && { patientId: parseInt(patientId) }),
                ...(recordType && { recordType }),
            },
            include: {
                patient: { select: { id: true, fullName: true, patientNumber: true } },
                doctor:  { select: { id: true, fullName: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        return res.json({ records });
    } catch (err) {
        console.error('[GET /records]', err);
        return res.status(500).json({ error: 'Failed to fetch records' });
    }
};

// ── POST /api/records ─────────────────────────────────────────────────────────
const createRecord = async (req, res) => {
    try {
        const {
            patientId, doctorId, recordType,
            title, diagnosis, findings,
            testResults, vitals, notes,
        } = req.body;

        const hospitalId = req.user.hospital_id;

        if (!patientId || !doctorId || !recordType || !title) {
            return res.status(400).json({ error: 'patientId, doctorId, recordType and title are required' });
        }

        const validTypes = ['lab_results', 'consultation', 'imaging', 'other'];
        if (!validTypes.includes(recordType)) {
            return res.status(400).json({ error: `recordType must be one of: ${validTypes.join(', ')}` });
        }

        const [patient, doctor] = await Promise.all([
            prisma.patient.findFirst({ where: { id: parseInt(patientId), hospitalId } }),
            prisma.hospitalStaff.findFirst({ where: { id: parseInt(doctorId), hospitalId } }),
        ]);

        if (!patient) return res.status(404).json({ error: 'Patient not found in your hospital' });
        if (!doctor)  return res.status(404).json({ error: 'Doctor not found in your hospital' });

        const record = await prisma.medicalRecord.create({
            data: {
                hospitalId,
                patientId:   parseInt(patientId),
                doctorId:    parseInt(doctorId),
                recordType,
                title:       title.trim(),
                diagnosis:   diagnosis   || null,
                findings:    findings    || null,
                testResults: testResults || null,
                vitals:      vitals      || null,
                notes:       notes       || null,
                recordDate:  new Date(),
            },
            include: {
                patient: { select: { fullName: true, patientNumber: true } },
                doctor:  { select: { fullName: true } },
            },
        });

        return res.status(201).json({ message: 'Medical record added successfully', record });
    } catch (err) {
        console.error('[POST /records]', err);
        return res.status(500).json({ error: 'Failed to add record' });
    }
};

// ── DELETE /api/records/:id ───────────────────────────────────────────────────
const deleteRecord = async (req, res) => {
    try {
        const id         = parseInt(req.params.id);
        const hospitalId = req.user.hospital_id;

        const record = await prisma.medicalRecord.findFirst({ where: { id, hospitalId } });
        if (!record) return res.status(404).json({ error: 'Record not found' });

        await prisma.medicalRecord.delete({ where: { id } });

        return res.json({ message: 'Record deleted successfully' });
    } catch (err) {
        console.error('[DELETE /records]', err);
        return res.status(500).json({ error: 'Failed to delete record' });
    }
};

module.exports = { getRecords, createRecord, deleteRecord };