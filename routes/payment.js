const express = require('express');
const router  = express.Router();
const prisma  = require('../lib/prisma');
const { verifyToken } = require('../middleware/authMiddleware');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

// Single source of truth — add more plans here later if needed
const PLANS = {
    professional: { name: 'professional', months: 1 },
};

// ── POST /api/payments/verify ─────────────────────────────────────────────────
router.post('/verify', verifyToken, async (req, res) => {
    try {
        const { reference } = req.body;
        if (!reference) return res.status(400).json({ error: 'Payment reference is required' });

        // 1. Verify with Paystack — never trust the frontend for payment status
        const psRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
            headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
        });

        if (!psRes.ok) {
            console.error('[payments/verify] Paystack API error:', psRes.status);
            return res.status(502).json({ error: 'Could not reach payment provider. Please try again.' });
        }

        const psData = await psRes.json();

        // 2. Confirm the transaction actually succeeded on Paystack's side
        if (!psData.status || psData.data?.status !== 'success') {
            console.warn('[payments/verify] Transaction not successful:', psData.data?.status);
            return res.status(402).json({ error: 'Payment was not completed successfully.' });
        }

        const { metadata, amount: amountKobo } = psData.data;

        // 3. Identify plan from metadata.planKey (passed by frontend in Paystack setup)
        const planKey  = metadata?.planKey?.toLowerCase();
        const planInfo = PLANS[planKey];

        if (!planInfo) {
            console.error('[payments/verify] Unknown planKey in metadata:', planKey);
            return res.status(400).json({
                error: `Unknown plan "${planKey}". Please contact support with reference: ${reference}`,
            });
        }

        const hospitalId = req.user.hospitalId;
        if (!hospitalId) {
            return res.status(400).json({ error: 'Could not determine hospital from token. Please log in again.' });
        }

        // 4. Guard against replayed references — idempotent if already activated
        const alreadyUsed = await prisma.subscription.findFirst({ where: { reference } });
        if (alreadyUsed) {
            return res.json({ message: 'Subscription already active', subscription: alreadyUsed });
        }

        // 5. Calculate expiry
        const activatedAt = new Date();
        const expiresAt   = new Date(activatedAt);
        expiresAt.setMonth(expiresAt.getMonth() + planInfo.months);

        // 6. Upsert — creates if first time, renews if re-subscribing
        const subscription = await prisma.subscription.upsert({
            where:  { hospitalId },
            create: {
                hospitalId,
                plan:        planInfo.name,
                status:      'active',
                amount:      amountKobo / 100,
                reference,
                activatedAt,
                expiresAt,
            },
            update: {
                plan:        planInfo.name,
                status:      'active',
                amount:      amountKobo / 100,
                reference,
                activatedAt,
                expiresAt,
            },
        });

        // 7. Notify (non-blocking)
        prisma.notification.create({
            data: {
                hospitalId,
                type:    'subscription_activated',
                title:   'Subscription Activated',
                message: `Your ${planInfo.name} plan is now active until ${expiresAt.toLocaleDateString()}.`,
                link:    'dashboard',
            },
        }).catch(err => console.error('[Notification] subscription:', err.message));

        console.log(`[payments/verify] Activated ${planInfo.name} for hospital ${hospitalId}, ref: ${reference}`);
        return res.json({ message: 'Subscription activated successfully', subscription });
    } catch (err) {
        console.error('[POST /payments/verify]', err);
        return res.status(500).json({ error: err.message });
    }
});

// ── GET /api/payments/subscription ───────────────────────────────────────────
router.get('/subscription', verifyToken, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;

        const subscription = await prisma.subscription.findUnique({ where: { hospitalId } });

        if (!subscription) return res.json({ subscription: null, active: false });

        const active = subscription.status === 'active' && new Date(subscription.expiresAt) > new Date();

        // Auto-mark as expired if past due (best-effort, non-blocking)
        if (!active && subscription.status === 'active') {
            prisma.subscription.update({ where: { hospitalId }, data: { status: 'expired' } })
                .catch(() => {});
        }

        return res.json({ subscription, active });
    } catch (err) {
        console.error('[GET /payments/subscription]', err);
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;