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
                            { description:   { contains: search, mode: 'insensitive' } },
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

        // Normalize: schema has both paidAmount and amountPaid — expose amountPaid to frontend
        const normalized = bills.map(b => ({
            ...b,
            totalAmount: b.totalAmount,                         // ✅ schema field
            amountPaid:  b.amountPaid ?? b.paidAmount ?? 0,    // ✅ both exist in schema
        }));

        return res.json({ bills: normalized });
    } catch (err) {
        console.error('[GET /billing]', err);
        return res.status(500).json({ error: err.message });
    }
});

// ── POST /api/billing/:hospitalId ────────────────────────────────────────────
// Frontend sends: { patientId, description, totalAmount, category, dueDate }
router.post('/:hospitalId', verifyToken, belongsToHospital, async (req, res) => {
    try {
        const hospitalId = parseInt(req.params.hospitalId);
        const { patientId, description, totalAmount, amount, category, items } = req.body;

        const finalAmount = parseFloat(totalAmount ?? amount ?? 0);

        if (!patientId || !description || !finalAmount) {
            return res.status(400).json({ error: 'patientId, description, and totalAmount are required' });
        }

        const bill = await withRetry(() =>
            prisma.billing.create({
                data: {
                    hospitalId,
                    patientId:     parseInt(patientId),
                    invoiceNumber: generateInvoiceNumber(),
                    description,                              // ✅ exists in schema
                    category:      category || 'consultation', // ✅ exists in schema
                    totalAmount:   finalAmount,               // ✅ schema field
                    paidAmount:    0,                         // ✅ schema field
                    amountPaid:    0,                         // ✅ schema field
                    items:         items ?? [],               // ✅ schema field (Json, required)
                    status:        'unpaid',
                    // NOTE: dueDate does NOT exist in your schema — removed
                },
                include: {
                    patient: { select: { id: true, fullName: true, patientNumber: true } },
                },
            })
        );

        const normalized = {
            ...bill,
            amountPaid: bill.amountPaid ?? 0,
        };

        prisma.notification.create({
            data: {
                hospitalId,
                type:    'billing_created',
                title:   'New Invoice Created',
                message: `Invoice ${bill.invoiceNumber} created for ${bill.patient.fullName}.`,
                link:    'billing',
            },
        }).catch(err => console.error('[Notification] billing_created:', err.message));

        return res.status(201).json({ message: 'Invoice created successfully', bill: normalized });
    } catch (err) {
        console.error('[POST /billing]', err);
        return res.status(500).json({ error: err.message });
    }
});

// ── POST /api/billing/:id/payment ────────────────────────────────────────────
// Frontend sends: { amount, method, notes }
router.post('/:id/payment', verifyToken, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { amount, method, paymentMethod } = req.body;

        const finalMethod = paymentMethod || method;
        const payAmount   = parseFloat(amount || 0);

        if (!finalMethod) {
            return res.status(400).json({ error: 'method (payment method) is required' });
        }

        const existing = await withRetry(() => prisma.billing.findUnique({ where: { id } }));
        if (!existing) return res.status(404).json({ error: 'Invoice not found' });

        const currentTotal = existing.totalAmount ?? 0;
        const currentPaid  = existing.amountPaid ?? existing.paidAmount ?? 0;
        const newPaid      = currentPaid + payAmount;

        let newStatus = 'partial';
        if (newPaid >= currentTotal) newStatus = 'paid';
        else if (newPaid <= 0)       newStatus = 'unpaid';

        const bill = await withRetry(() =>
            prisma.billing.update({
                where: { id },
                data: {
                    paymentMethod: finalMethod,     // ✅ schema field
                    amountPaid:    newPaid,          // ✅ schema field
                    paidAmount:    newPaid,          // ✅ keep both in sync
                    status:        newStatus,
                    paidAt:        newStatus === 'paid' ? new Date() : null,
                    // NOTE: `notes` does NOT exist on Billing in schema — removed
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
        return res.status(500).json({ error: err.message });
    }
});

// ── DELETE /api/billing/:id ───────────────────────────────────────────────────
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await withRetry(() => prisma.billing.delete({ where: { id } }));
        return res.json({ message: 'Invoice deleted successfully' });
    } catch (err) {
        console.error('[DELETE /billing/:id]', err);
        if (err.code === 'P2025') return res.status(404).json({ error: 'Invoice not found' });
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;