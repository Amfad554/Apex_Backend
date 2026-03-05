const jwt = require('jsonwebtoken');

// ─── Verify JWT ────────────────────────────────────────────────────────────────
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

// ─── Role guards ───────────────────────────────────────────────────────────────
const isSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'super_admin')
    return res.status(403).json({ error: 'Access denied. Super Admin only.' });
  next();
};

const isHospitalAdmin = (req, res, next) => {
  if (req.user.role !== 'hospital_admin')
    return res.status(403).json({ error: 'Access denied. Hospital Admin only.' });
  next();
};

const isHospitalStaffOrAdmin = (req, res, next) => {
  const allowed = ['hospital_admin', 'doctor', 'nurse', 'pharmacist', 'lab_staff', 'receptionist'];
  if (!allowed.includes(req.user.role))
    return res.status(403).json({ error: 'Access denied. Hospital staff only.' });
  next();
};

// ─── Scope guard ──────────────────────────────────────────────────────────────
// Ensures the requesting user can only access their own hospital's data.
// Super-admin bypasses this.
const belongsToHospital = (req, res, next) => {
  if (req.user.role === 'super_admin') return next();

  const hospitalId = parseInt(req.params.hospitalId ?? req.body.hospitalId);
  if (!hospitalId || req.user.hospital_id !== hospitalId)
    return res.status(403).json({ error: 'Access denied. You can only access your own hospital data.' });

  next();
};

// ─── Role helper (use inline in routes) ──────────────────────────────────────
// e.g. requireRole(['doctor', 'hospital_admin'])
const requireRole = (roles) => (req, res, next) => {
  if (!roles.includes(req.user.role))
    return res.status(403).json({ error: `Access denied. Requires role: ${roles.join(' or ')}.` });
  next();
};

module.exports = {
  verifyToken,
  isSuperAdmin,
  isHospitalAdmin,
  isHospitalStaffOrAdmin,
  belongsToHospital,
  requireRole,
};