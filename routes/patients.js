const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { verifyToken, isHospitalAdmin, belongsToHospital } = require('../middleware/authMiddleware');
const { sendPatientCredentials } = require('../lib/mailer');

const prisma = new PrismaClient();

const generateTempPassword = () => Math.random().toString(36).slice(-8) + Math.floor(Math.random() * 100);
const generatePatientNumber = () => 'PAT-' + Date.now().toString().slice(-6) + Math.floor(Math.random() * 100);

// ── Retry wrapper for Neon sleep timeouts ─────────────────────────────────────
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
        console.warn(`[patients] DB connection error, retrying (${attempt}/${retries})...`);
        try { await prisma.$queryRaw`SELECT 1`; } catch (_) {}
        await new Promise(res => setTimeout(res, delayMs));
      } else {
        throw err;
      }
    }
  }
}

// ── POST /api/patients/login ──────────────────────────────────────────────────
// MUST be before /:hospitalId to avoid route conflict
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

    const patient = await withRetry(() => prisma.patient.findFirst({
      where: { email: email.toLowerCase().trim() },
    }));

    if (!patient || !patient.passwordHash) return res.status(401).json({ message: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, patient.passwordHash);
    if (!valid) return res.status(401).json({ message: 'Invalid credentials' });

    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { id: patient.id, role: 'patient', hospital_id: patient.hospitalId },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      token,
      user: { id: patient.id, fullName: patient.fullName, email: patient.email, patientNumber: patient.patientNumber, role: 'patient' },
    });
  } catch (err) {
    console.error('[POST /patients/login]', err);
    return res.status(500).json({ message: 'Login failed' });
  }
});

// ── GET /api/patients/detail/:id ──────────────────────────────────────────────
// MUST be before /:hospitalId to avoid route conflict
router.get('/detail/:id', verifyToken, async (req, res) => {
  try {
    const patient = await withRetry(() => prisma.patient.findUnique({
      where: { id: parseInt(req.params.id) },
      select: {
        id: true, patientNumber: true, fullName: true, dateOfBirth: true,
        gender: true, phone: true, email: true, address: true,
        bloodGroup: true, medicalConditions: true,
        nextOfKinName: true, nextOfKinPhone: true, createdAt: true,
      },
    }));
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    return res.json({ patient });
  } catch (err) {
    console.error('[GET /patients/detail]', err);
    return res.status(500).json({ error: 'Failed to fetch patient' });
  }
});

// ── POST /api/patients — register + send email ────────────────────────────────
router.post('/', verifyToken, isHospitalAdmin, async (req, res) => {
  try {
    const { fullName, dateOfBirth, gender, phone, email, address, bloodGroup, medicalConditions, nextOfKinName, nextOfKinPhone } = req.body;
    const hospitalId = req.user.hospital_id;

    if (!fullName || !dateOfBirth || !phone || !address) {
      return res.status(400).json({ error: 'fullName, dateOfBirth, phone and address are required' });
    }

    const hospital = await withRetry(() => prisma.hospital.findUnique({
      where: { id: hospitalId },
      select: { hospitalName: true },
    }));

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const patientNumber = generatePatientNumber();

    const patient = await withRetry(() => prisma.patient.create({
      data: {
        hospitalId,
        patientNumber,
        fullName: fullName.trim(),
        dateOfBirth: new Date(dateOfBirth),
        gender: gender || 'male',
        phone,
        email: email ? email.toLowerCase().trim() : null,
        address,
        bloodGroup: bloodGroup || null,
        medicalConditions: medicalConditions || null,
        nextOfKinName: nextOfKinName || null,
        nextOfKinPhone: nextOfKinPhone || null,
        passwordHash,
      },
      select: {
        id: true, patientNumber: true, fullName: true, dateOfBirth: true,
        gender: true, phone: true, email: true, address: true,
        bloodGroup: true, medicalConditions: true,
        nextOfKinName: true, nextOfKinPhone: true, createdAt: true,
      },
    }));

    if (email) {
      sendPatientCredentials({
        to: email,
        fullName: fullName.trim(),
        email: email.toLowerCase().trim(),
        tempPassword,
        patientNumber,
        hospitalName: hospital?.hospitalName || 'Your Hospital',
      }).catch(err => console.error('[Email] Failed to send patient credentials:', err.message));
    }

    return res.status(201).json({ message: 'Patient registered successfully', patient });
  } catch (err) {
    console.error('[POST /patients]', err);
    if (err.code === 'P2002') return res.status(409).json({ error: 'A patient with this email already exists' });
    return res.status(500).json({ error: 'Failed to register patient' });
  }
});

// ── GET /api/patients/:hospitalId ─────────────────────────────────────────────
router.get('/:hospitalId', verifyToken, belongsToHospital, async (req, res) => {
  try {
    const hospitalId = parseInt(req.params.hospitalId);
    const { search, limit } = req.query;

    const patients = await withRetry(() => prisma.patient.findMany({
      where: {
        hospitalId,
        ...(search && {
          OR: [
            { fullName:      { contains: search, mode: 'insensitive' } },
            { patientNumber: { contains: search, mode: 'insensitive' } },
            { email:         { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      select: {
        id: true, patientNumber: true, fullName: true, dateOfBirth: true,
        gender: true, phone: true, email: true, address: true,
        bloodGroup: true, medicalConditions: true,
        nextOfKinName: true, nextOfKinPhone: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      ...(limit && { take: parseInt(limit) }),
    }));

    return res.json({ patients });
  } catch (err) {
    console.error('[GET /patients]', err);
    return res.status(500).json({ error: 'Failed to fetch patients' });
  }
});

// ── DELETE /api/patients/:id ──────────────────────────────────────────────────
router.delete('/:id', verifyToken, isHospitalAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const hospitalId = req.user.hospital_id;
    const patient = await withRetry(() => prisma.patient.findFirst({ where: { id, hospitalId } }));
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    await withRetry(() => prisma.patient.delete({ where: { id } }));
    return res.json({ message: 'Patient deleted successfully' });
  } catch (err) {
    console.error('[DELETE /patients]', err);
    return res.status(500).json({ error: 'Failed to delete patient' });
  }
});

module.exports = router;