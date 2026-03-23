const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { verifyToken, isHospitalAdmin, belongsToHospital } = require('../middleware/authMiddleware');
const { sendStaffCredentials } = require('../lib/mailer');

const prisma = new PrismaClient();

const generateTempPassword = () => Math.random().toString(36).slice(-8) + Math.floor(Math.random() * 100);

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
        console.warn(`[staff] DB connection error, retrying (${attempt}/${retries})...`);
        try { await prisma.$queryRaw`SELECT 1`; } catch (_) {}
        await new Promise(res => setTimeout(res, delayMs));
      } else {
        throw err;
      }
    }
  }
}

// GET /api/staff/:hospitalId
router.get('/:hospitalId', verifyToken, belongsToHospital, async (req, res) => {
  try {
    const hospitalId = parseInt(req.params.hospitalId);
    const { search, role } = req.query;

    const staff = await withRetry(() => prisma.hospitalStaff.findMany({
      where: {
        hospitalId,
        ...(role && { role }),
        ...(search && {
          OR: [
            { fullName: { contains: search, mode: 'insensitive' } },
            { email:    { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      select: {
        id: true, fullName: true, email: true, role: true,
        specialty: true, department: true, phone: true,
        status: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }));

    return res.json({ staff });
  } catch (err) {
    console.error('[GET /staff]', err);
    return res.status(500).json({ error: 'Failed to fetch staff' });
  }
});

// POST /api/staff — add staff + send email
router.post('/', verifyToken, isHospitalAdmin, async (req, res) => {
  try {
    const { fullName, email, role, department, specialty, phone } = req.body;
    const hospitalId = req.user.hospital_id;

    if (!fullName || !email || !role) {
      return res.status(400).json({ error: 'fullName, email and role are required' });
    }

    const validRoles = ['doctor', 'nurse', 'pharmacist', 'lab_staff', 'receptionist'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: `Role must be one of: ${validRoles.join(', ')}` });
    }

    const existing = await withRetry(() => prisma.hospitalStaff.findFirst({
      where: { hospitalId, email: email.toLowerCase().trim() },
    }));
    if (existing) return res.status(409).json({ error: 'A staff member with this email already exists' });

    const hospital = await withRetry(() => prisma.hospital.findUnique({
      where: { id: hospitalId },
      select: { hospitalName: true },
    }));

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const staff = await withRetry(() => prisma.hospitalStaff.create({
      data: {
        hospitalId,
        fullName: fullName.trim(),
        email: email.toLowerCase().trim(),
        role,
        department: department || null,
        specialty: specialty || null,
        phone: phone || null,
        passwordHash,
        status: 'active',
      },
      select: {
        id: true, fullName: true, email: true, role: true,
        department: true, specialty: true, phone: true,
        status: true, createdAt: true,
      },
    }));

    // ── Notify hospital about new staff ───────────────────────────────────────
    prisma.notification.create({
      data: {
        hospitalId,
        recipientId: null,
        recipientRole: null,
        type: 'staff_added',
        title: 'New Staff Member Added',
        message: `${fullName.trim()} has been added as a ${role}.`,
        link: 'staff',
      },
    }).catch(err => console.error('[Notification] staff_added:', err.message));

    sendStaffCredentials({
      to: email,
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(),
      tempPassword,
      hospitalName: hospital?.hospitalName || 'Your Hospital',
      role,
    }).catch(err => console.error('[Email] Failed to send staff credentials:', err.message));

    return res.status(201).json({ message: 'Staff member added successfully', staff, tempPassword });
  } catch (err) {
    console.error('[POST /staff]', err);
    return res.status(500).json({ error: 'Failed to add staff member' });
  }
});

// PATCH /api/staff/:id/status
router.patch('/:id/status', verifyToken, isHospitalAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const hospitalId = req.user.hospital_id;
    const { status } = req.body;

    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ error: 'Status must be active or inactive' });
    }

    const staff = await withRetry(() => prisma.hospitalStaff.findFirst({ where: { id, hospitalId } }));
    if (!staff) return res.status(404).json({ error: 'Staff member not found' });

    const updated = await withRetry(() => prisma.hospitalStaff.update({
      where: { id },
      data: { status },
      select: { id: true, fullName: true, status: true },
    }));

    return res.json({ message: `Staff marked as ${status}`, staff: updated });
  } catch (err) {
    console.error('[PATCH /staff/status]', err);
    return res.status(500).json({ error: 'Failed to update staff status' });
  }
});

// DELETE /api/staff/:id
router.delete('/:id', verifyToken, isHospitalAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const hospitalId = req.user.hospital_id;

    const staff = await withRetry(() => prisma.hospitalStaff.findFirst({ where: { id, hospitalId } }));
    if (!staff) return res.status(404).json({ error: 'Staff member not found' });

    await withRetry(() => prisma.hospitalStaff.delete({ where: { id } }));
    return res.json({ message: 'Staff member removed successfully' });
  } catch (err) {
    console.error('[DELETE /staff]', err);
    return res.status(500).json({ error: 'Failed to delete staff member' });
  }
});

module.exports = router;