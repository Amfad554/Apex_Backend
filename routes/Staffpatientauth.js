const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { verifyToken } = require('../middleware/authMiddleware');
const prisma = require('../lib/prisma');

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/patient/login
// ─────────────────────────────────────────────────────────────────────────────
router.post('/patient/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required.' });

    const patient = await prisma.patient.findFirst({
      where: { email: email.toLowerCase().trim() },
      include: { hospital: { select: { id: true, hospitalName: true, status: true } } },
    });

    if (!patient)
      return res.status(401).json({ error: 'Invalid email or password.' });

    if (patient.hospital.status !== 'approved')
      return res.status(403).json({ error: 'This hospital account is not active.' });

    if (!patient.passwordHash)
      return res.status(401).json({ error: 'Your login credentials have not been set up yet. Contact your hospital.' });

    const isMatch = await bcrypt.compare(password, patient.passwordHash);
    if (!isMatch)
      return res.status(401).json({ error: 'Invalid email or password.' });

    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { id: patient.id, hospital_id: patient.hospitalId, role: 'patient' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      token,
      user: {
        id: patient.id,
        fullName: patient.fullName,
        email: patient.email,
        role: 'patient',
        patientNumber: patient.patientNumber,
        bloodGroup: patient.bloodGroup,
        gender: patient.gender,
        phone: patient.phone,
        hospitalId: patient.hospitalId,
        hospitalName: patient.hospital.hospitalName,
      },
    });
  } catch (err) {
    console.error('[patient/login]', err);
    return res.status(500).json({ error: 'Login failed.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/change-password  (all roles)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/change-password', verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const { id, role } = req.user;

    if (!currentPassword || !newPassword)
      return res.status(400).json({ error: 'Current and new password are required.' });
    if (newPassword.length < 8)
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    if (currentPassword === newPassword)
      return res.status(400).json({ error: 'New password must be different from current.' });

    let record;
    if (role === 'hospital_admin') {
      record = await prisma.hospital.findUnique({ where: { id: parseInt(id) } });
    } else if (['doctor','nurse','pharmacist','lab_staff','receptionist'].includes(role)) {
      record = await prisma.hospitalStaff.findUnique({ where: { id: parseInt(id) } });
    } else if (role === 'patient') {
      record = await prisma.patient.findUnique({ where: { id: parseInt(id) } });
    } else {
      return res.status(403).json({ error: 'Role not supported.' });
    }

    if (!record) return res.status(404).json({ error: 'User not found.' });

    const isMatch = await bcrypt.compare(currentPassword, record.passwordHash);
    if (!isMatch) return res.status(401).json({ error: 'Current password is incorrect.' });

    const newHash = await bcrypt.hash(newPassword, 12);

    if (role === 'hospital_admin') {
      await prisma.hospital.update({ where: { id: parseInt(id) }, data: { passwordHash: newHash } });
    } else if (['doctor','nurse','pharmacist','lab_staff','receptionist'].includes(role)) {
      await prisma.hospitalStaff.update({ where: { id: parseInt(id) }, data: { passwordHash: newHash } });
    } else if (role === 'patient') {
      await prisma.patient.update({ where: { id: parseInt(id) }, data: { passwordHash: newHash } });
    }

    return res.status(200).json({ message: 'Password changed successfully.' });
  } catch (err) {
    console.error('[change-password]', err);
    return res.status(500).json({ error: 'Failed to change password.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/me
// ─────────────────────────────────────────────────────────────────────────────
router.get('/me', verifyToken, async (req, res) => {
  try {
    const { id, role } = req.user;
    let user;

    if (role === 'hospital_admin') {
      user = await prisma.hospital.findUnique({
        where: { id: parseInt(id) },
        select: { id: true, hospitalName: true, email: true, adminName: true, hospitalType: true, phone: true, address: true, status: true },
      });
      if (user) user.role = 'hospital_admin';

    } else if (['doctor','nurse','pharmacist','lab_staff','receptionist'].includes(role)) {
      user = await prisma.hospitalStaff.findUnique({
        where: { id: parseInt(id) },
        select: { id: true, fullName: true, email: true, role: true, department: true, specialty: true, hospitalId: true, status: true, hospital: { select: { hospitalName: true } } },
      });
      if (user) { user.staffRole = user.role; user.hospitalName = user.hospital?.hospitalName; delete user.hospital; }

    } else if (role === 'patient') {
      user = await prisma.patient.findUnique({
        where: { id: parseInt(id) },
        select: { id: true, fullName: true, email: true, patientNumber: true, gender: true, bloodGroup: true, phone: true, hospitalId: true, hospital: { select: { hospitalName: true } } },
      });
      if (user) { user.role = 'patient'; user.hospitalName = user.hospital?.hospitalName; delete user.hospital; }

    } else if (role === 'super_admin') {
      user = await prisma.superAdmin.findUnique({
        where: { id: parseInt(id) },
        select: { id: true, username: true },
      });
      if (user) user.role = 'super_admin';
    }

    if (!user) return res.status(404).json({ error: 'User not found.' });
    return res.status(200).json({ user });
  } catch (err) {
    console.error('[/me]', err);
    return res.status(500).json({ error: 'Failed to fetch user.' });
  }
});

module.exports = router;