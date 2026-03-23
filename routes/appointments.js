const express = require('express');
const router  = express.Router();
const prisma  = require('../lib/prisma');
const {
  verifyToken, isHospitalAdmin,
  belongsToHospital, requireRole,
} = require('../middleware/authMiddleware');

// ─── GET /api/appointments/:hospitalId ────────────────────────────────────────
router.get('/:hospitalId', verifyToken, belongsToHospital, async (req, res) => {
  try {
    const hospitalId = parseInt(req.params.hospitalId);
    const { status, date, patientId, doctorId, page = '1', limit = '25' } = req.query;

    const take = Math.min(parseInt(limit), 100);
    const skip = (Math.max(parseInt(page), 1) - 1) * take;

    // ── Reliable "today" date range ──────────────────────────────────────────
    let dateFilter;
    if (date) {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      dateFilter = { gte: d, lt: next };
    }

    const where = {
      hospitalId,
      ...(status    && { status }),
      ...(patientId && { patientId: parseInt(patientId) }),
      ...(doctorId  && { doctorId:  parseInt(doctorId) }),
      ...(dateFilter && { appointmentDate: dateFilter }),
    };

    const [appointments, total] = await Promise.all([
      prisma.appointment.findMany({
        where,
        include: {
          patient: { select: { id: true, fullName: true, patientNumber: true, phone: true } },
          doctor:  { select: { id: true, fullName: true, role: true, department: true } },
        },
        orderBy: [{ appointmentDate: 'asc' }, { appointmentTime: 'asc' }],
        take,
        skip,
      }),
      prisma.appointment.count({ where }),
    ]);

    return res.json({ appointments, total, page: parseInt(page), limit: take });
  } catch (err) {
    console.error('[GET /appointments]', err);
    return res.status(500).json({ error: 'Failed to fetch appointments.' });
  }
});

// ─── POST /api/appointments ───────────────────────────────────────────────────
router.post('/', verifyToken, async (req, res) => {
  try {
    const { patientId, doctorId, appointmentDate, appointmentTime, reason, notes } = req.body;
    const hospitalId = req.user.hospital_id;

    if (!patientId || !doctorId || !appointmentDate || !appointmentTime || !reason?.trim())
      return res.status(400).json({ error: 'patientId, doctorId, appointmentDate, appointmentTime and reason are required.' });

    const [patient, doctor] = await Promise.all([
      prisma.patient.findFirst({ where: { id: parseInt(patientId), hospitalId } }),
      prisma.hospitalStaff.findFirst({ where: { id: parseInt(doctorId), hospitalId } }),
    ]);

    if (!patient) return res.status(404).json({ error: 'Patient not found in your hospital.' });
    if (!doctor)  return res.status(404).json({ error: 'Doctor not found in your hospital.' });

    // ── Parse date/time ──────────────────────────────────────────────────────
    const apptDate = new Date(appointmentDate);
    apptDate.setHours(0, 0, 0, 0);
    const apptTime = new Date(`1970-01-01T${appointmentTime}:00`);

    // ── Double-booking check ─────────────────────────────────────────────────
    const conflict = await prisma.appointment.findFirst({
      where: {
        doctorId:       parseInt(doctorId),
        appointmentDate: apptDate,
        appointmentTime: apptTime,
        status:         { not: 'cancelled' },
      },
    });
    if (conflict)
      return res.status(409).json({ error: 'Doctor already has an appointment at this time.' });

    const appointment = await prisma.appointment.create({
      data: {
        hospitalId,
        patientId:       parseInt(patientId),
        doctorId:        parseInt(doctorId),
        appointmentDate: apptDate,
        appointmentTime: apptTime,
        reason:          reason.trim(),
        notes:           notes?.trim() || null,
        status:          'scheduled',
      },
      include: {
        patient: { select: { fullName: true, patientNumber: true } },
        doctor:  { select: { fullName: true, department: true } },
      },
    });

    // ── Notify hospital about new appointment ─────────────────────────────────
    prisma.notification.create({
      data: {
        hospitalId,
        recipientId: null,
        recipientRole: null,
        type: 'appointment_booked',
        title: 'Appointment Booked',
        message: `${appointment.patient.fullName} has an appointment with Dr. ${appointment.doctor.fullName} on ${new Date(apptDate).toLocaleDateString()}.`,
        link: 'appointments',
      },
    }).catch(err => console.error('[Notification] appointment_booked:', err.message));

    return res.status(201).json({ message: 'Appointment booked successfully.', appointment });
  } catch (err) {
    console.error('[POST /appointments]', err);
    return res.status(500).json({ error: 'Failed to book appointment.' });
  }
});

// ─── PATCH /api/appointments/:id/status ──────────────────────────────────────
// Doctors and admins can update status
router.patch(
  '/:id/status',
  verifyToken,
  requireRole(['hospital_admin', 'doctor', 'nurse', 'receptionist']),
  async (req, res) => {
    try {
      const id         = parseInt(req.params.id);
      const hospitalId = req.user.hospital_id;
      const { status } = req.body;

      const validStatuses = ['scheduled', 'completed', 'cancelled', 'no_show'];
      if (!validStatuses.includes(status))
        return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });

      const appointment = await prisma.appointment.findFirst({ where: { id, hospitalId } });
      if (!appointment) return res.status(404).json({ error: 'Appointment not found.' });

      const updated = await prisma.appointment.update({
        where: { id },
        data:  { status },
        include: {
          patient: { select: { fullName: true } },
          doctor:  { select: { fullName: true } },
        },
      });

      return res.json({ message: `Appointment marked as ${status}.`, appointment: updated });
    } catch (err) {
      console.error('[PATCH /appointments/status]', err);
      return res.status(500).json({ error: 'Failed to update appointment.' });
    }
  },
);

// ─── DELETE /api/appointments/:id ─────────────────────────────────────────────
router.delete('/:id', verifyToken, isHospitalAdmin, async (req, res) => {
  try {
    const id         = parseInt(req.params.id);
    const hospitalId = req.user.hospital_id;

    const appointment = await prisma.appointment.findFirst({ where: { id, hospitalId } });
    if (!appointment) return res.status(404).json({ error: 'Appointment not found.' });

    await prisma.appointment.delete({ where: { id } });

    return res.json({ message: 'Appointment deleted successfully.' });
  } catch (err) {
    console.error('[DELETE /appointments]', err);
    return res.status(500).json({ error: 'Failed to delete appointment.' });
  }
});

module.exports = router;