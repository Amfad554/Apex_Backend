const prisma = require('../lib/prisma');

// GET /api/hospitals/search
exports.searchHospitals = async (req, res) => {
    try {
        const { q } = req.query;

        if (!q || q.trim().length < 2)
            return res.status(400).json({ error: 'Search query must be at least 2 characters.' });

        const hospitals = await prisma.hospital.findMany({
            where: {
                status: 'approved',
                OR: [
                    { hospitalName: { contains: q.trim(), mode: 'insensitive' } },
                    { address:      { contains: q.trim(), mode: 'insensitive' } },
                ],
            },
            select: {
                id: true, hospitalName: true,
                hospitalType: true, address: true, phone: true,
            },
            take: 10,
        });

        return res.json({ hospitals });
    } catch (err) {
        console.error('[GET /hospitals/search]', err);
        return res.status(500).json({ error: 'Search failed.' });
    }
};

// GET /api/hospitals/stats
exports.getHospitalStats = async (req, res) => {
    try {
        const hospitalId = req.user.hospital_id;

        const today    = new Date(); today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);

        const [
            totalPatients,
            totalStaff,
            totalAppointments,
            todayAppointments,
            activePrescriptions,
        ] = await Promise.all([
            prisma.patient.count({ where: { hospitalId } }),
            prisma.hospitalStaff.count({ where: { hospitalId, status: 'active' } }),
            prisma.appointment.count({ where: { hospitalId } }),
            prisma.appointment.count({
                where: {
                    hospitalId,
                    appointmentDate: { gte: today, lt: tomorrow },
                    status: 'scheduled',
                },
            }),
            prisma.prescription.count({ where: { hospitalId, status: 'active' } }),
        ]);

        return res.json({
            stats: { totalPatients, totalStaff, totalAppointments, todayAppointments, activePrescriptions },
        });
    } catch (err) {
        console.error('[GET /hospitals/stats]', err);
        return res.status(500).json({ error: 'Failed to fetch stats.' });
    }
};

// GET /api/hospitals/me
exports.getHospitalProfile = async (req, res) => {
    try {
        const hospital = await prisma.hospital.findUnique({
            where: { id: req.user.hospital_id },
            select: {
                id: true, hospitalName: true, hospitalType: true,
                address: true, phone: true, email: true,
                adminName: true, status: true, createdAt: true,
            },
        });

        if (!hospital) return res.status(404).json({ error: 'Hospital not found.' });
        return res.json({ hospital });
    } catch (err) {
        console.error('[GET /hospitals/me]', err);
        return res.status(500).json({ error: 'Failed to fetch hospital profile.' });
    }
};

// PUT /api/hospitals/profile
exports.updateHospitalProfile = async (req, res) => {
    try {
        const id = req.user.hospital_id;
        const { hospitalName, hospitalType, phone, address, email } = req.body;

        if (!hospitalName?.trim() || !phone?.trim() || !address?.trim())
            return res.status(400).json({ error: 'hospitalName, phone and address are required.' });

        if (email?.trim()) {
            const taken = await prisma.hospital.findFirst({
                where: { email: email.toLowerCase().trim(), NOT: { id } },
            });
            if (taken)
                return res.status(409).json({ error: 'This email is already used by another hospital.' });
        }

        const updated = await prisma.hospital.update({
            where: { id },
            data: {
                hospitalName: hospitalName.trim(),
                ...(hospitalType && { hospitalType: hospitalType.toLowerCase() }),
                phone:   phone.trim(),
                address: address.trim(),
                ...(email && { email: email.toLowerCase().trim() }),
            },
            select: {
                id: true, hospitalName: true, hospitalType: true,
                phone: true, address: true, email: true,
                adminName: true, status: true,
            },
        });

        return res.json({ message: 'Profile updated successfully.', hospital: updated });
    } catch (err) {
        console.error('[PUT /hospitals/profile]', err);
        return res.status(500).json({ error: 'Failed to update profile.' });
    }
};