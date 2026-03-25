const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { verifyToken, belongsToHospital } = require('../middleware/authMiddleware');

const generateInvoiceNumber = () =>
  'INV-' + Date.now().toString().slice(-6) + Math.floor(Math.random() * 100);

async function withRetry(fn, retries = 3, delayMs = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isConnectionErr =
        err.message?.includes('connect') ||
        err.message?.includes('timeout') ||
        err.message?.includes('Server has closed') ||
        err.errorCode === 'P1001' ||
        err.errorCode === 'P1008' ||
        err.errorCode === 'P1017';
      if (isConnectionErr && attempt < retries) {
        console.warn(`[billing] DB retry (${attempt}/${retries})...`);
        await new Promise(res => setTimeout(res, delayMs));
      } else throw err;
    }
  }
}

// ── GET /api/billing/:hospitalId ─────────────────────────────────────────────
router.get('/:hospitalId', verifyToken, belongsToHospital, async (req, res) => {
  try {
    const hospitalId = parseInt(req.params.hospitalId);
    const { search, status } = req.query;

    const bills = await withRetry(() =>
      prisma.billing.findMany({
        where: {
          hospitalId,
          ...(status && { status }),
          ...(search && {
            OR: [
              { invoiceNumber: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
              { patient: { fullName: { contains: search, mode: 'insensitive' } } },
            ],
          }),
        },
        include: {
          patient: { select: { id: true, fullName: true, patientNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
    );

    return res.json({ bills });
  } catch (err) {
    console.error('[GET /billing]', err);
    return res.status(500).json({ error: 'Failed to fetch billing records' });
  }
});

// ── POST /api/billing/:hospitalId ────────────────────────────────────────────
router.post('/:hospitalId', verifyToken, belongsToHospital, async (req, res) => {
  try {
    const hospitalId = parseInt(req.params.hospitalId);
    const { patientId, description, amount } = req.body;

    if (!patientId || !description || amount === undefined) {
      return res.status(400).json({ error: 'patientId, description, and amount are required' });
    }

    const bill = await withRetry(() =>
      prisma.billing.create({
        data: {
          hospitalId,
          patientId: parseInt(patientId),
          invoiceNumber: generateInvoiceNumber(),
          description,
          amount: parseFloat(amount),
          status: 'unpaid',
        },
        include: {
          patient: { select: { id: true, fullName: true, patientNumber: true } },
        },
      })
    );

    prisma.notification.create({
      data: {
        hospitalId,
        type: 'billing_created',
        title: 'New Invoice Created',
        message: `Invoice ${bill.invoiceNumber} created for ${bill.patient.fullName}.`,
        link: 'billing',
      },
    }).catch(err => console.error('[Notification] billing_created:', err.message));

    return res.status(201).json({ message: 'Invoice created successfully', bill });
  } catch (err) {
    console.error('[POST /billing]', err);
    return res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// ── POST /api/billing/:id/payment ────────────────────────────────────────────
router.post('/:id/payment', verifyToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { paymentMethod, status } = req.body;

    if (!paymentMethod) {
      return res.status(400).json({ error: 'paymentMethod is required' });
    }

    const bill = await withRetry(() =>
      prisma.billing.update({
        where: { id },
        data: {
          paymentMethod,
          status: status || 'paid',
          paidAt: new Date(),
        },
        include: {
          patient: { select: { id: true, fullName: true, patientNumber: true } },
        },
      })
    );

    return res.json({ message: 'Payment recorded successfully', bill });
  } catch (err) {
    console.error('[POST /billing/:id/payment]', err);
    if (err.code === 'P2025') return res.status(404).json({ error: 'Invoice not found' });
    return res.status(500).json({ error: 'Failed to record payment' });
  }
});

module.exports = router;