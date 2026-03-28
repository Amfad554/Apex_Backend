const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { verifyToken } = require('../middleware/authMiddleware');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

// ── POST /api/payments/verify ─────────────────────────────────────────────────
// Called by frontend after Paystack callback fires.
// Verifies the transaction with Paystack, then activates the hospital subscription.
router.post('/verify', verifyToken, async (req, res) => {
    try {
        const { reference } = req.body;
        if (!reference) return res.status(400).json({ error: 'Payment reference is required' });

        // 1. Verify with Paystack
        const psRes = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
            headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
        });
        const psData = await psRes.json();

        if (!psData.status || psData.data?.status !== 'success') {
            return res.status(402).json({ error: 'Payment verification failed', detail: psData.message });
        }

        const { amount, metadata } = psData.data;   // amount is in kobo
        const hospitalId = req.user.hospitalId;      // set by verifyToken middleware

        // 2. Determine plan from amount paid (kobo)
        const PLANS = {
            1990000: { name: 'professional', months: 1 },   // ₦19,900
        };
        const planInfo = PLANS[amount] || { name: 'professional', months: 1 };

        // 3. Calculate expiry
        const activatedAt = new Date();
        const expiresAt = new Date(activatedAt);
        expiresAt.setMonth(expiresAt.getMonth() + planInfo.months);

        // 4. Upsert subscription
        const subscription = await prisma.subscription.upsert({
            where: { hospitalId },
            create: {
                hospitalId,
                plan: planInfo.name,
                status: 'active',
                amount: amount / 100,             // store in naira
                reference,
                activatedAt,
                expiresAt,
            },
            update: {
                plan: planInfo.name,
                status: 'active',
                amount: amount / 100,
                reference,
                activatedAt,
                expiresAt,
            },
        });

        // 5. Fire a notification (non-blocking)
        prisma.notification.create({
            data: {
                hospitalId,
                type: 'subscription_activated',
                title: 'Subscription Activated',
                message: `Your ${planInfo.name} plan is now active until ${expiresAt.toLocaleDateString()}.`,
                link: 'dashboard',
            },
        }).catch(err => console.error('[Notification] subscription:', err.message));

        return res.json({
            message: 'Subscription activated successfully',
            subscription,
        });
    } catch (err) {
        console.error('[POST /payments/verify]', err);
        return res.status(500).json({ error: err.message });
    }
});

// ── GET /api/payments/subscription ───────────────────────────────────────────
// Returns the current hospital's subscription status.
router.get('/subscription', verifyToken, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;

        const subscription = await prisma.subscription.findUnique({
            where: { hospitalId },
        });

        if (!subscription) {
            return res.json({ subscription: null, active: false });
        }

        const active = subscription.status === 'active' && new Date(subscription.expiresAt) > new Date();

        return res.json({ subscription, active });
    } catch (err) {
        console.error('[GET /payments/subscription]', err);
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;