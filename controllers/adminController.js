const prisma  = require('../config/prisma');
const { sendHospitalApprovalEmail } = require('../lib/mailer');

// GET /api/admin/hospitals
exports.getAllHospitals = async (req, res) => {
    try {
        const { status } = req.query;

        const hospitals = await prisma.hospital.findMany({
            where: status ? { status } : {},
            include: {
                _count: {
                    select: { patients: true, staff: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        return res.json({
            hospitals: hospitals.map(h => ({
                id:           h.id,
                name:         h.hospitalName,
                type:         h.hospitalType,
                address:      h.address,
                phone:        h.phone,
                email:        h.email,
                license:      h.licenseNumber,
                status:       h.status,
                admin:        h.adminName,
                patientCount: h._count.patients,
                staffCount:   h._count.staff,
                createdAt:    h.createdAt,
            })),
        });
    } catch (err) {
        console.error('[GET /admin/hospitals]', err);
        return res.status(500).json({ error: 'Failed to fetch hospitals' });
    }
};

// PUT /api/admin/hospitals/:id/approve
exports.approveHospital = async (req, res) => {
    try {
        const hospitalId = parseInt(req.params.id);

        const hospital = await prisma.hospital.update({
            where: { id: hospitalId },
            data:  { status: 'approved', approvedAt: new Date() },
        });

        // Fire approval email — non-blocking so UI doesn't stall if email fails
        sendHospitalApprovalEmail({
            to:           hospital.email,
            hospitalName: hospital.hospitalName,
            adminName:    hospital.adminName,
        }).catch(err => console.error('[approveHospital] Email failed:', err.message));

        return res.json({
            message:  'Hospital approved successfully.',
            hospital: { id: hospital.id, name: hospital.hospitalName, status: hospital.status },
        });
    } catch (err) {
        console.error('[PUT /admin/hospitals/:id/approve]', err);
        return res.status(500).json({ error: 'Failed to approve hospital.', details: err.message });
    }
};

// PUT /api/admin/hospitals/:id/suspend
exports.suspendHospital = async (req, res) => {
    try {
        const hospitalId = parseInt(req.params.id);

        const hospital = await prisma.hospital.update({
            where: { id: hospitalId },
            data:  { status: 'suspended' },
        });

        return res.json({
            message:  'Hospital suspended.',
            hospital: { id: hospital.id, name: hospital.hospitalName, status: hospital.status },
        });
    } catch (err) {
        console.error('[PUT /admin/hospitals/:id/suspend]', err);
        return res.status(500).json({ error: 'Failed to suspend hospital.', details: err.message });
    }
};

// PUT /api/admin/hospitals/:id/reactivate
exports.reactivateHospital = async (req, res) => {
    try {
        const hospitalId = parseInt(req.params.id);

        const hospital = await prisma.hospital.update({
            where: { id: hospitalId },
            data:  { status: 'approved' },
        });

        return res.json({
            message:  'Hospital reactivated.',
            hospital: { id: hospital.id, name: hospital.hospitalName, status: hospital.status },
        });
    } catch (err) {
        console.error('[PUT /admin/hospitals/:id/reactivate]', err);
        return res.status(500).json({ error: 'Failed to reactivate hospital.', details: err.message });
    }
};

// DELETE /api/admin/hospitals/:id
exports.deleteHospital = async (req, res) => {
    try {
        const hospitalId = parseInt(req.params.id);

        const hospital = await prisma.hospital.delete({
            where: { id: hospitalId },
        });

        return res.json({
            message:  'Hospital deleted.',
            hospital: { id: hospital.id, name: hospital.hospitalName },
        });
    } catch (err) {
        console.error('[DELETE /admin/hospitals/:id]', err);
        if (err.code === 'P2025')
            return res.status(404).json({ error: 'Hospital not found.' });
        return res.status(500).json({ error: 'Failed to delete hospital.', details: err.message });
    }
};

// GET /api/admin/stats
exports.getPlatformStats = async (req, res) => {
    try {
        const [totalH, pendingH, patients, appointments] = await Promise.all([
            prisma.hospital.count(),
            prisma.hospital.count({ where: { status: 'pending' } }),
            prisma.patient.count(),
            prisma.appointment.count(),
        ]);

        return res.json({
            stats: {
                total_hospitals:    totalH,
                pending_hospitals:  pendingH,
                total_patients:     patients,
                total_appointments: appointments,
            },
        });
    } catch (err) {
        console.error('[GET /admin/stats]', err);
        return res.status(500).json({ error: 'Failed to fetch statistics' });
    }
};