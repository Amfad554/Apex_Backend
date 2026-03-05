const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');
const { verifyToken, isSuperAdmin } = require('../middleware/authMiddleware');

// Apply auth middleware to all admin routes
router.use(verifyToken, isSuperAdmin);

// =====================================================
// GET ALL HOSPITALS (with stats)
// =====================================================
router.get('/hospitals', async (req, res) => {
  try {
    const { status } = req.query;

    const hospitals = await prisma.hospital.findMany({
      where: status ? { status } : {},
      include: {
        _count: {
          select: {
            patients: true,
            staff: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      hospitals: hospitals.map(h => ({
        id: h.id,
        name: h.hospitalName,
        type: h.hospitalType,
        address: h.address,
        phone: h.phone,
        email: h.email,
        license: h.licenseNumber,
        status: h.status,
        patientCount: h._count.patients,
        staffCount: h._count.staff,
        createdAt: h.createdAt
      }))
    });
  } catch (error) {
    console.error('Error fetching hospitals:', error);
    res.status(500).json({ error: 'Failed to fetch hospitals' });
  }
});


router.put('/hospitals/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;

    const hospital = await prisma.hospital.update({
      // Convert string ID to Integer
      where: { id: parseInt(id) }, 
      data: {
        status: 'approved',
        approvedAt: new Date(),
      }
    });

    res.json({ 
      message: 'Hospital approved successfully', 
      hospital: {
        id: hospital.id,
        name: hospital.hospitalName,
        status: hospital.status
      }
    });
  } catch (error) {
    // Logging the error is crucial for debugging!
    console.error('Approve Error:', error); 
    res.status(500).json({ error: 'Failed to approve hospital', details: error.message });
  }
});

// =====================================================
// GET PLATFORM STATISTICS
// =====================================================
router.get('/stats', async (req, res) => {
  try {
    // Run multiple counts in parallel for performance
    const [totalH, pendingH, patients, appointments] = await Promise.all([
      prisma.hospital.count(),
      prisma.hospital.count({ where: { status: 'pending' } }),
      prisma.patient.count(),
      prisma.appointment.count()
    ]);

    res.json({
      stats: {
        total_hospitals: totalH,
        pending_hospitals: pendingH,
        total_patients: patients,
        total_appointments: appointments
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

module.exports = router;