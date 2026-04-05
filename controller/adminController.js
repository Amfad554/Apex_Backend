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

        await sendHospitalApprovalEmail({
            to:           hospital.email,
            hospitalName: hospital.hospitalName,
            adminName:    hospital.adminName,
        });

        return res.json({
            message:  'Hospital approved successfully.',
            hospital: { id: hospital.id, name: hospital.hospitalName, status: hospital.status },
        });
    } catch (err) {
        console.error('[PUT /admin/hospitals/:id/approve]', err);
        return res.status(500).json({ error: 'Failed to approve hospital.', details: err.message });
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
                total_hospitals:   totalH,
                pending_hospitals: pendingH,
                total_patients:    patients,
                total_appointments: appointments,
            },
        });
    } catch (err) {
        console.error('[GET /admin/stats]', err);
        return res.status(500).json({ error: 'Failed to fetch statistics' });
    }
};