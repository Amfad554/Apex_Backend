const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');

// Generate JWT token
const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

// =====================================================
// SUPER ADMIN LOGIN
// =====================================================
router.post('/admin/login', [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;

    // Find admin
    const result = await db.query(
      'SELECT * FROM super_admins WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const admin = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, admin.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = generateToken({
      id: admin.id,
      username: admin.username,
      role: 'super_admin'
    });

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: admin.id,
        username: admin.username,
        role: 'super_admin'
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// =====================================================
// HOSPITAL REGISTRATION
// =====================================================
router.post('/hospital/register', [
  body('hospitalName').trim().notEmpty().withMessage('Hospital name is required'),
  body('hospitalType').isIn(['public', 'private', 'specialty', 'clinic', 'medical_center']).withMessage('Invalid hospital type'),
  body('address').trim().notEmpty().withMessage('Address is required'),
  body('phone').trim().notEmpty().withMessage('Phone is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('licenseNumber').trim().notEmpty().withMessage('License number is required'),
  body('adminName').trim().notEmpty().withMessage('Administrator name is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) {
      throw new Error('Passwords do not match');
    }
    return true;
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      hospitalName,
      hospitalType,
      address,
      phone,
      email,
      licenseNumber,
      adminName,
      password
    } = req.body;

    // Check if email or license already exists
    const existingCheck = await db.query(
      'SELECT email, license_number FROM hospitals WHERE email = $1 OR license_number = $2',
      [email, licenseNumber]
    );

    if (existingCheck.rows.length > 0) {
      const existing = existingCheck.rows[0];
      if (existing.email === email) {
        return res.status(400).json({ error: 'Email already registered' });
      }
      if (existing.license_number === licenseNumber) {
        return res.status(400).json({ error: 'License number already registered' });
      }
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Insert hospital
    const result = await db.query(
      `INSERT INTO hospitals 
       (hospital_name, hospital_type, address, phone, email, license_number, admin_name, password_hash, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
       RETURNING id, hospital_name, email, status, created_at`,
      [hospitalName, hospitalType, address, phone, email, licenseNumber, adminName, passwordHash]
    );

    const hospital = result.rows[0];

    res.status(201).json({
      message: 'Hospital registration submitted successfully. Awaiting admin approval.',
      hospital: {
        id: hospital.id,
        name: hospital.hospital_name,
        email: hospital.email,
        status: hospital.status,
        registeredAt: hospital.created_at
      }
    });
  } catch (error) {
    console.error('Hospital registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// =====================================================
// HOSPITAL LOGIN
// =====================================================
router.post('/hospital/login', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find hospital
    const result = await db.query(
      'SELECT * FROM hospitals WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const hospital = result.rows[0];

    // Check if hospital is approved
    if (hospital.status === 'pending') {
      return res.status(403).json({ error: 'Your hospital registration is pending approval' });
    }

    if (hospital.status === 'suspended') {
      return res.status(403).json({ error: 'Your hospital account has been suspended' });
    }

    if (hospital.status === 'rejected') {
      return res.status(403).json({ error: 'Your hospital registration was rejected' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, hospital.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = generateToken({
      id: hospital.id,
      hospital_id: hospital.id,
      email: hospital.email,
      hospital_name: hospital.hospital_name,
      role: 'hospital_admin'
    });

    res.json({
      message: 'Login successful',
      token,
      hospital: {
        id: hospital.id,
        name: hospital.hospital_name,
        email: hospital.email,
        type: hospital.hospital_type,
        role: 'hospital_admin'
      }
    });
  } catch (error) {
    console.error('Hospital login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// =====================================================
// PATIENT LOGIN
// =====================================================
router.post('/patient/login', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find patient
    const result = await db.query(
      `SELECT p.*, h.hospital_name, h.status as hospital_status 
       FROM patients p
       JOIN hospitals h ON p.hospital_id = h.id
       WHERE p.email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const patient = result.rows[0];

    // Check if hospital is active
    if (patient.hospital_status !== 'approved') {
      return res.status(403).json({ error: 'Hospital account is not active' });
    }

    // Verify password
    if (!patient.password_hash) {
      return res.status(401).json({ error: 'Please set up your password first' });
    }

    const isValidPassword = await bcrypt.compare(password, patient.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = generateToken({
      id: patient.id,
      patient_id: patient.id,
      hospital_id: patient.hospital_id,
      email: patient.email,
      role: 'patient'
    });

    res.json({
      message: 'Login successful',
      token,
      patient: {
        id: patient.id,
        name: patient.full_name,
        email: patient.email,
        patientNumber: patient.patient_number,
        hospital: patient.hospital_name,
        role: 'patient'
      }
    });
  } catch (error) {
    console.error('Patient login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

module.exports = router;