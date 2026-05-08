const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const adminController = require('../controllers/adminController');
const {
    sendHospitalApprovalEmail,
    sendHospitalSuspensionEmail,
    sendHospitalRejectionEmail,
} = require('../utils/SendEmail');
// All admin routes require a valid super_admin token
router.use(verifyToken);
router.use(requireRole(['super_admin']));

// ─── Hospitals ─────────────────────────────────────────────────────────────────
router.get('/hospitals', adminController.getAllHospitals);
router.put('/hospitals/:id/approve', adminController.approveHospital);
router.put('/hospitals/:id/suspend', adminController.suspendHospital);
router.put('/hospitals/:id/reactivate', adminController.reactivateHospital);
router.delete('/hospitals/:id', adminController.deleteHospital);

// ─── Platform stats ────────────────────────────────────────────────────────────
router.get('/stats', adminController.getPlatformStats);
router.put('/hospitals/:id/approve', adminAuth, async (req, res) => {
    try {
        const hospital = await Hospital.findByIdAndUpdate(
            req.params.id, { status: 'approved' }, { new: true }
        );
        // Send approval email
        await sendHospitalApprovalEmail({
            to: hospital.email,
            hospitalName: hospital.name,
            adminName: hospital.admin,
        });
        res.json({ hospital });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/admin/hospitals/:id/suspend
router.put('/hospitals/:id/suspend', adminAuth, async (req, res) => {
    try {
        const hospital = await Hospital.findByIdAndUpdate(
            req.params.id, { status: 'suspended' }, { new: true }
        );
        await sendHospitalSuspensionEmail({
            to: hospital.email,
            hospitalName: hospital.name,
            adminName: hospital.admin,
        });
        res.json({ hospital });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/admin/hospitals/:id  (reject)
router.delete('/hospitals/:id', adminAuth, async (req, res) => {
    try {
        const hospital = await Hospital.findByIdAndDelete(req.params.id);
        await sendHospitalRejectionEmail({
            to: hospital.email,
            hospitalName: hospital.name,
            adminName: hospital.admin,
        });
        res.json({ hospital });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
module.exports = router;