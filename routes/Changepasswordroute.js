// Add these routes to your existing auth.js or patients.js / staff.js router
// POST /api/auth/change-password  — works for patients AND staff based on role in JWT

const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');

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

        // ── Determine which model to query based on token role ──
        let record;
        if (role === 'patient') {
            record = await prisma.patient.findUnique({ where: { id }, select: { id: true, passwordHash: true } });
        } else if (['doctor', 'nurse', 'pharmacist', 'lab_staff', 'receptionist'].includes(role)) {
            record = await prisma.hospitalStaff.findUnique({ where: { id }, select: { id: true, passwordHash: true } });
        } else if (role === 'hospital_admin') {
            record = await prisma.hospital.findUnique({ where: { id }, select: { id: true, passwordHash: true } });
        } else {
            return res.status(403).json({ error: 'Role not permitted to change password here.' });
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