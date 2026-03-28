const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const rateLimit = require('express-rate-limit');
const { sendEmail } = require('../lib/mailer');

const { verifyToken } = require('../middleware/authMiddleware');
// ─── Rate limiters ────────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
});

const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 5,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many reset requests. Please try again in 1 hour.' },
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

    const existing = await prisma.hospital.findFirst({
      where: { OR: [{ email: email.toLowerCase().trim() }, { licenseNumber: licenseNumber.trim() }] },
    });
    if (existing) {
      const field = existing.email === email.toLowerCase().trim() ? 'email' : 'license number';
      return res.status(409).json({ error: `A hospital with this ${field} is already registered.` });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.hospital.create({
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

    const hospital = await prisma.hospital.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { subscription: { select: { status: true, plan: true, expiresAt: true } } },
    });

    if (!hospital) return res.status(401).json({ error: 'Invalid email or password.' });

    if (hospital.status === 'pending')
      return res.status(403).json({ error: 'Your account is pending approval.' });
    if (hospital.status === 'suspended')
      return res.status(403).json({ error: 'This account has been suspended. Contact support.' });
    if (hospital.status === 'rejected')
      return res.status(403).json({ error: 'This hospital registration was rejected. Contact support.' });

    const isMatch = await bcrypt.compare(password, hospital.passwordHash);
    if (!isMatch) return res.status(401).json({ error: 'Invalid email or password.' });

    const sub = hospital.subscription;
    const isActive = sub && sub.status === 'active' && (!sub.expiresAt || new Date(sub.expiresAt) > new Date());

    const token = jwt.sign(
      { id: hospital.id, hospital_id: hospital.id, role: 'hospital_admin' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' },
    );

    return res.json({
      message: 'Login successful',
      token,
      subscriptionStatus: sub?.status || 'none',
      requiresPayment: !isActive,
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

// ─── POST /api/auth/hospital/forgot-password ──────────────────────────────────
router.post('/hospital/forgot-password', forgotLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required.' });

    const hospital = await prisma.hospital.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true, hospitalName: true, email: true },
    });

    if (!hospital) {
      return res.json({ message: 'If this email is registered, a reset code has been sent.' });
    }

    console.log('✅ Hospital found:', hospital.id);  // ADD

    const code      = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const codeHash  = await bcrypt.hash(code, 10);

    console.log('✅ Code hashed');  // ADD

    await prisma.hospital.update({
      where: { id: hospital.id },
      data:  { resetCodeHash: codeHash, resetCodeExpiry: expiresAt },
    });

    console.log('✅ Code saved to DB');  // ADD

   await sendEmail({
  to:      hospital.email,
  subject: 'Your Password Reset Code',
  html: `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
      <h2 style="color:#0A1A3F;margin-bottom:8px;">Password Reset Request</h2>
      <p style="color:#374151;margin-bottom:24px;">
        Hi <strong>${hospital.hospitalName}</strong>, here is your 6-digit reset code.
        It expires in <strong>15 minutes</strong>.
      </p>
      <div style="background:#F5F7FA;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
        <span style="font-size:40px;font-weight:900;letter-spacing:14px;color:#FF5A1F;">${code}</span>
      </div>
      <p style="color:#6B7280;font-size:13px;">
        If you didn't request this, you can safely ignore this email.
      </p>
    </div>
  `,
});

    console.log('✅ Email sent');  // ADD

    return res.json({ message: 'If this email is registered, a reset code has been sent.' });
  } catch (err) {
    console.error('[FORGOT PASSWORD ERROR]', err);  // MAKE SURE THIS IS HERE
    return res.status(500).json({ message: 'Failed to process request.' });
  }
});

// ─── POST /api/auth/hospital/reset-password ───────────────────────────────────
router.post('/hospital/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword)
      return res.status(400).json({ message: 'Email, code and newPassword are required.' });
    if (newPassword.length < 8)
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });

    const hospital = await prisma.hospital.findUnique({
      where:  { email: email.toLowerCase().trim() },
      select: { id: true, resetCodeHash: true, resetCodeExpiry: true },
    });

    if (!hospital || !hospital.resetCodeHash || !hospital.resetCodeExpiry)
      return res.status(400).json({ message: 'Invalid or expired reset code.' });

    if (new Date() > new Date(hospital.resetCodeExpiry))
      return res.status(400).json({ message: 'Reset code has expired. Please request a new one.' });

    const codeMatch = await bcrypt.compare(code, hospital.resetCodeHash);
    if (!codeMatch)
      return res.status(400).json({ message: 'Invalid reset code.' });

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.hospital.update({
      where: { id: hospital.id },
      data:  { passwordHash, resetCodeHash: null, resetCodeExpiry: null },
    });

    return res.json({ message: 'Password reset successfully.' });
  } catch (err) {
    console.error('[POST /auth/hospital/reset-password]', err);
    return res.status(500).json({ message: 'Failed to reset password.' });
  }
});

// ─── POST /api/auth/admin/login ───────────────────────────────────────────────
router.post('/admin/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password are required.' });

    const admin = await prisma.superAdmin.findUnique({ where: { username } });
    if (!admin) return res.status(401).json({ error: 'Invalid credentials.' });

    const isMatch = await bcrypt.compare(password, admin.passwordHash);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials.' });

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

    const staff = await prisma.hospitalStaff.findFirst({
      where: { hospitalId: parseInt(hospitalId), email: identifier.toLowerCase().trim() },
    });

    if (!staff) return res.status(401).json({ error: 'Invalid credentials.' });
    if (staff.status === 'inactive')
      return res.status(403).json({ error: 'Your account is inactive. Contact your hospital admin.' });

    const isMatch = await bcrypt.compare(password, staff.passwordHash);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials.' });

    const token = jwt.sign(
      { id: staff.id, hospital_id: staff.hospitalId, role: staff.role },
      process.env.JWT_SECRET,
      { expiresIn: '12h' },
    );

    return res.json({
      message: 'Login successful',
      token,
      user: {
        id: staff.id, fullName: staff.fullName, email: staff.email,
        role: staff.role, department: staff.department,
        specialty: staff.specialty, hospitalId: staff.hospitalId,
      },
    });
  } catch (err) {
    console.error('[POST /auth/staff/login]', err);
    return res.status(500).json({ error: 'Login failed.' });
  }
});

// ─── POST /api/auth/staff/forgot-password ─────────────────────────────────────
router.post('/staff/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });
    console.log(`[Forgot password requested for staff: ${email}]`);
    return res.json({ message: 'If this email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('[POST /auth/staff/forgot-password]', err);
    return res.status(500).json({ error: 'Request failed.' });
  }
});


router.post('/change-password', verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
 
    if (!currentPassword || !newPassword)
      return res.status(400).json({ error: 'Current and new password are required.' });
 
    if (newPassword.length < 8)
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
 
    if (currentPassword === newPassword)
      return res.status(400).json({ error: 'New password must be different from current password.' });
 
    const { id, role } = req.user;
 
    let record;
    if (role === 'patient') {
      record = await prisma.patient.findUnique({
        where: { id }, select: { id: true, passwordHash: true }
      });
    } else if (['doctor', 'nurse', 'pharmacist', 'lab_staff', 'receptionist'].includes(role)) {
      record = await prisma.hospitalStaff.findUnique({
        where: { id }, select: { id: true, passwordHash: true }
      });
    } else if (role === 'hospital_admin') {
      record = await prisma.hospital.findUnique({
        where: { id }, select: { id: true, passwordHash: true }
      });
    } else {
      return res.status(403).json({ error: 'Role not permitted.' });
    }
 
    if (!record) return res.status(404).json({ error: 'User not found.' });
 
    const match = await bcrypt.compare(currentPassword, record.passwordHash);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect.' });
 
    const passwordHash = await bcrypt.hash(newPassword, 12);
 
    if (role === 'patient') {
      await prisma.patient.update({ where: { id }, data: { passwordHash } });
    } else if (['doctor', 'nurse', 'pharmacist', 'lab_staff', 'receptionist'].includes(role)) {
      await prisma.hospitalStaff.update({ where: { id }, data: { passwordHash } });
    } else if (role === 'hospital_admin') {
      await prisma.hospital.update({ where: { id }, data: { passwordHash } });
    }
 
    return res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    console.error('[POST /auth/change-password]', err);
    return res.status(500).json({ error: 'Failed to change password.' });
  }
});

module.exports = router;