const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const rateLimit = require('express-rate-limit');

// ─── Rate limiter (brute-force protection) ────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// ─── POST /api/auth/hospital/register ─────────────────────────────────────────
router.post('/hospital/register', async (req, res) => {
  try {
    const {
      hospitalName, hospitalType, address, phone,
      email, licenseNumber, adminName, password,
    } = req.body;

    // ── Validation ──────────────────────────────────────────────────────────
    const missing = [];
    if (!hospitalName?.trim()) missing.push('hospitalName');
    if (!hospitalType) missing.push('hospitalType');
    if (!address?.trim()) missing.push('address');
    if (!phone?.trim()) missing.push('phone');
    if (!email?.trim()) missing.push('email');
    if (!licenseNumber?.trim()) missing.push('licenseNumber');
    if (!adminName?.trim()) missing.push('adminName');
    if (!password) missing.push('password');

    if (missing.length)
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });

    if (!validateEmail(email))
      return res.status(400).json({ error: 'Invalid email address.' });

    if (password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    const validTypes = ['public', 'private', 'specialty', 'clinic', 'medical_center'];
    if (!validTypes.includes(hospitalType.toLowerCase()))
      return res.status(400).json({ error: `hospitalType must be one of: ${validTypes.join(', ')}` });

    // ── Duplicate check ─────────────────────────────────────────────────────
    const existing = await prisma.Hospital.findFirst({
      where: { OR: [{ email: email.toLowerCase().trim() }, { licenseNumber: licenseNumber.trim() }] },
    });
    if (existing) {
      const field = existing.email === email.toLowerCase().trim() ? 'email' : 'license number';
      return res.status(409).json({ error: `A hospital with this ${field} is already registered.` });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.Hospital.create({
      data: {
        hospitalName: hospitalName.trim(),
        hospitalType: hospitalType.toLowerCase(),
        address: address.trim(),
        phone: phone.trim(),
        email: email.toLowerCase().trim(),
        licenseNumber: licenseNumber.trim(),
        adminName: adminName.trim(),
        passwordHash,
        status: 'pending',
      },
    });

    return res.status(201).json({ message: 'Registration successful! Awaiting admin approval.' });
  } catch (err) {
    console.error('[POST /auth/hospital/register]', err);
    if (err.code === 'P2002')
      return res.status(409).json({ error: 'Email or license number already registered.' });
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ─── POST /api/auth/hospital/login ────────────────────────────────────────────
router.post('/hospital/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required.' });

    const hospital = await prisma.Hospital.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!hospital)
      return res.status(401).json({ error: 'Invalid email or password.' });

    if (hospital.status === 'pending')
      return res.status(403).json({ error: 'Your account is pending approval. Please wait for the admin to verify your hospital.' });

    if (hospital.status === 'suspended')
      return res.status(403).json({ error: 'This account has been suspended. Contact support.' });

    if (hospital.status === 'rejected')
      return res.status(403).json({ error: 'This hospital registration was rejected. Contact support.' });

    const isMatch = await bcrypt.compare(password, hospital.passwordHash);
    if (!isMatch)
      return res.status(401).json({ error: 'Invalid email or password.' });

    // ── Token includes hospital_id so middleware can scope data ─────────────
    const token = jwt.sign(
      { id: hospital.id, hospital_id: hospital.id, role: 'hospital_admin' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' },
    );

    return res.json({
      message: 'Login successful',
      token,
      user: {
        id: hospital.id,
        name: hospital.hospitalName,
        email: hospital.email,
        adminName: hospital.adminName,
        hospitalType: hospital.hospitalType,
        role: 'hospital_admin',
      },
    });
  } catch (err) {
    console.error('[POST /auth/hospital/login]', err);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ─── POST /api/auth/admin/login ───────────────────────────────────────────────
router.post('/admin/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password)
      return res.status(400).json({ error: 'Username and password are required.' });

    const admin = await prisma.superAdmin.findUnique({ where: { username } });

    if (!admin)
      return res.status(401).json({ error: 'Invalid credentials.' });

    const isMatch = await bcrypt.compare(password, admin.passwordHash);
    if (!isMatch)
      return res.status(401).json({ error: 'Invalid credentials.' });

    const token = jwt.sign(
      { id: admin.id, role: 'super_admin' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' },
    );

    return res.json({
      message: 'Login successful',
      token,
      user: { id: admin.id, username: admin.username, role: 'super_admin' },
    });
  } catch (err) {
    console.error('[POST /auth/admin/login]', err);
    return res.status(500).json({ error: 'Login failed.' });
  }
});

// ─── POST /api/auth/staff/login ───────────────────────────────────────────────
router.post('/staff/login', loginLimiter, async (req, res) => {
  try {
    const { identifier, password, hospitalId } = req.body;

    if (!identifier || !password || !hospitalId)
      return res.status(400).json({ error: 'identifier, password, and hospitalId are required.' });

    // Find staff by email within that hospital
    const staff = await prisma.hospitalStaff.findFirst({
      where: {
        hospitalId: parseInt(hospitalId),
        email: identifier.toLowerCase().trim(),
      },
    });

    if (!staff)
      return res.status(401).json({ error: 'Invalid credentials.' });

    if (staff.status === 'inactive')
      return res.status(403).json({ error: 'Your account is inactive. Contact your hospital admin.' });

    const isMatch = await bcrypt.compare(password, staff.passwordHash);
    if (!isMatch)
      return res.status(401).json({ error: 'Invalid credentials.' });

    const token = jwt.sign(
      { id: staff.id, hospital_id: staff.hospitalId, role: staff.role },
      process.env.JWT_SECRET,
      { expiresIn: '12h' },
    );

    return res.json({
      message: 'Login successful',
      token,
      user: {
        id: staff.id,
        fullName: staff.fullName,
        email: staff.email,
        role: staff.role,
        department: staff.department,
        specialty: staff.specialty,
        hospitalId: staff.hospitalId,
      },
    });
  } catch (err) {
    console.error('[POST /auth/staff/login]', err);
    return res.status(500).json({ error: 'Login failed.' });
  }
});

// ─── POST /api/auth/staff/forgot-password ─────────────────────────────────────
// Always returns 200 to prevent email enumeration
router.post('/staff/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    // In production: look up staff, generate a hashed reset token,
    // save it with an expiry, and email the link.
    // We return 200 regardless to prevent email enumeration.
    console.log(`[Forgot password requested for: ${email}]`);

    return res.json({ message: 'If this email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('[POST /auth/staff/forgot-password]', err);
    return res.status(500).json({ error: 'Request failed.' });
  }
});

module.exports = router;