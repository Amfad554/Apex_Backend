const express    = require('express');
const router     = express.Router();
const nodemailer = require('nodemailer');
const prisma     = require('../lib/prisma');
const { verifyToken, isHospitalAdmin, isSuperAdmin } = require('../middleware/authMiddleware');

// ─── Email transporter ────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const PLAN_AMOUNTS = {
  clinic:       490000,   // ₦4,900 in kobo
  professional: 1990000,  // ₦19,900
  enterprise:   4990000,  // ₦49,900
};

/* ─────────────────────────────────────────────────────────────────────────────
   GET /api/subscriptions/status
   Hospital admin checks their own subscription status.
   Returns { status, plan, expiresAt } — used by the frontend guard.
───────────────────────────────────────────────────────────────────────────── */
router.get('/status', verifyToken, isHospitalAdmin, async (req, res) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { hospitalId: req.user.hospital_id },
      select: {
        status:      true,
        plan:        true,
        activatedAt: true,
        expiresAt:   true,
        createdAt:   true,
      },
    });

    if (!subscription) {
      // No subscription record at all — never submitted proof
      return res.json({ status: 'none', plan: null });
    }

    return res.json(subscription);
  } catch (err) {
    console.error('[GET /subscriptions/status]', err);
    return res.status(500).json({ error: 'Failed to fetch subscription status.' });
  }
});

/* ─────────────────────────────────────────────────────────────────────────────
   POST /api/subscriptions/proof
   Hospital submits payment proof (reference + screenshot).
   Creates or updates a Subscription record with status = 'pending'.
   Emails the admin (you) with all details + screenshot attached.
───────────────────────────────────────────────────────────────────────────── */
router.post('/proof', async (req, res) => {
  try {
    const {
      plan, amount,
      name, email, hospital, phone,
      reference,
      screenshotBase64, screenshotName,
    } = req.body;

    if (!name || !email || !phone || !reference || !screenshotBase64 || !plan) {
      return res.status(400).json({ error: 'All fields including screenshot are required.' });
    }

    if (!PLAN_AMOUNTS[plan.toLowerCase()]) {
      return res.status(400).json({ error: 'Invalid plan selected.' });
    }

    // Try to find the hospital by email so we can link the subscription
    const hospitalRecord = await prisma.hospital.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    // If hospital exists in DB, create/update the subscription record
    if (hospitalRecord) {
      await prisma.subscription.upsert({
        where:  { hospitalId: hospitalRecord.id },
        update: { plan: plan.toLowerCase(), reference, status: 'pending', updatedAt: new Date() },
        create: {
          hospitalId: hospitalRecord.id,
          plan:       plan.toLowerCase(),
          reference,
          amount:     PLAN_AMOUNTS[plan.toLowerCase()],
          status:     'pending',
        },
      });
    }

    // ── Email YOU with the proof ───────────────────────────────────────────────
    const base64Data      = screenshotBase64.replace(/^data:image\/\w+;base64,/, '');
    const screenshotBuffer = Buffer.from(base64Data, 'base64');
    const submittedAt     = new Date().toLocaleString('en-NG', { timeZone: 'Africa/Lagos' });

    await transporter.sendMail({
      from:    `"Apex HMS Payments" <${process.env.EMAIL_USER}>`,
      to:      process.env.NOTIFY_EMAIL || 'georgechiamaka02@gmail.com',
      subject: `💰 Payment Proof — ${plan} Plan | ${hospital}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1e293b;">
          <div style="background:linear-gradient(135deg,#4f46e5,#3b82f6);padding:32px;border-radius:16px 16px 0 0;text-align:center;">
            <h1 style="color:white;margin:0;font-size:24px;">💰 New Payment Proof</h1>
            <p style="color:#c7d2fe;margin:8px 0 0;"><strong>${plan}</strong> Plan</p>
          </div>
          <div style="background:#f8fafc;padding:32px;border-radius:0 0 16px 16px;border:1px solid #e2e8f0;">
            <div style="background:white;border-radius:12px;padding:20px;margin-bottom:16px;border:1px solid #e2e8f0;">
              <h3 style="margin:0 0 12px;color:#4f46e5;">Hospital Details</h3>
              <table style="width:100%;border-collapse:collapse;">
                <tr><td style="padding:5px 0;color:#64748b;width:40%;">Hospital</td><td style="padding:5px 0;font-weight:bold;">${hospital}</td></tr>
                <tr><td style="padding:5px 0;color:#64748b;">Admin Name</td><td style="padding:5px 0;font-weight:bold;">${name}</td></tr>
                <tr><td style="padding:5px 0;color:#64748b;">Email</td><td style="padding:5px 0;"><a href="mailto:${email}">${email}</a></td></tr>
                <tr><td style="padding:5px 0;color:#64748b;">Phone</td><td style="padding:5px 0;">${phone}</td></tr>
              </table>
            </div>
            <div style="background:white;border-radius:12px;padding:20px;margin-bottom:16px;border:1px solid #e2e8f0;">
              <h3 style="margin:0 0 12px;color:#4f46e5;">Payment Details</h3>
              <table style="width:100%;border-collapse:collapse;">
                <tr><td style="padding:5px 0;color:#64748b;width:40%;">Plan</td><td style="padding:5px 0;font-weight:bold;">${plan}</td></tr>
                <tr><td style="padding:5px 0;color:#64748b;">Amount</td><td style="padding:5px 0;font-weight:bold;color:#16a34a;">${amount}/month</td></tr>
                <tr><td style="padding:5px 0;color:#64748b;">Reference</td><td style="padding:5px 0;font-family:monospace;background:#f1f5f9;padding:4px 8px;border-radius:4px;">${reference}</td></tr>
                <tr><td style="padding:5px 0;color:#64748b;">Submitted</td><td style="padding:5px 0;">${submittedAt}</td></tr>
              </table>
            </div>
            <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:12px;padding:16px;margin-bottom:16px;">
              <p style="margin:0;color:#92400e;font-weight:bold;">⚡ Action Required</p>
              <p style="margin:8px 0 0;color:#92400e;font-size:14px;">
                Verify the screenshot attached, then go to your <strong>Super Admin dashboard → Subscriptions</strong>
                and activate this hospital's subscription.
              </p>
            </div>
            <p style="color:#94a3b8;font-size:12px;text-align:center;">Screenshot attached below.</p>
          </div>
        </div>
      `,
      attachments: [{
        filename:    screenshotName || 'payment_screenshot.png',
        content:     screenshotBuffer,
        contentType: 'image/png',
      }],
    });

    // ── Confirmation email to the hospital ────────────────────────────────────
    await transporter.sendMail({
      from:    `"Apex HMS" <${process.env.EMAIL_USER}>`,
      to:      email,
      subject: `✅ Payment Proof Received — ${plan} Plan`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1e293b;">
          <div style="background:linear-gradient(135deg,#4f46e5,#3b82f6);padding:32px;border-radius:16px 16px 0 0;text-align:center;">
            <h1 style="color:white;margin:0;">✅ Payment Proof Received</h1>
          </div>
          <div style="background:#f8fafc;padding:32px;border-radius:0 0 16px 16px;border:1px solid #e2e8f0;">
            <p>Hi <strong>${name}</strong>,</p>
            <p>We've received your payment proof for the <strong>${plan} Plan (${amount}/month)</strong>.</p>
            <div style="background:white;border-radius:12px;padding:20px;border:1px solid #e2e8f0;margin:16px 0;">
              <p style="margin:8px 0;">✅ We'll verify your payment (usually within a few hours)</p>
              <p style="margin:8px 0;">✅ We'll activate your hospital account</p>
              <p style="margin:8px 0;">✅ You'll receive a confirmation email within <strong>24 hours</strong></p>
              <p style="margin:8px 0;">✅ Then you can login and access your full dashboard</p>
            </div>
            <p>Your reference: <code style="background:#f1f5f9;padding:4px 8px;border-radius:4px;">${reference}</code></p>
            <p style="color:#64748b;font-size:14px;">Questions? Reply to this email.</p>
            <p>— The Apex HMS Team</p>
          </div>
        </div>
      `,
    });

    return res.json({ message: 'Payment proof submitted. You will be notified within 24 hours.' });

  } catch (err) {
    console.error('[POST /subscriptions/proof]', err);
    return res.status(500).json({ error: 'Failed to submit payment proof. Please try again.' });
  }
});

/* ─────────────────────────────────────────────────────────────────────────────
   GET /api/subscriptions/pending
   Super admin views all pending payment proofs.
───────────────────────────────────────────────────────────────────────────── */
router.get('/pending', verifyToken, isSuperAdmin, async (req, res) => {
  try {
    const pending = await prisma.subscription.findMany({
      where: { status: 'pending' },
      include: {
        hospital: {
          select: { id: true, hospitalName: true, email: true, adminName: true, phone: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ subscriptions: pending });
  } catch (err) {
    console.error('[GET /subscriptions/pending]', err);
    return res.status(500).json({ error: 'Failed to fetch pending subscriptions.' });
  }
});

/* ─────────────────────────────────────────────────────────────────────────────
   PATCH /api/subscriptions/:hospitalId/activate
   Super admin activates a hospital's subscription after verifying payment.
   Also sends activation email to the hospital.
───────────────────────────────────────────────────────────────────────────── */
router.patch('/:hospitalId/activate', verifyToken, isSuperAdmin, async (req, res) => {
  try {
    const hospitalId = parseInt(req.params.hospitalId);
    const { months = 1 } = req.body; // how many months to activate (default 1)

    const activatedAt = new Date();
    const expiresAt   = new Date(activatedAt);
    expiresAt.setMonth(expiresAt.getMonth() + months);

    const subscription = await prisma.subscription.update({
      where:  { hospitalId },
      data:   {
        status:      'active',
        activatedAt,
        expiresAt,
        activatedBy: req.user.id,
      },
      include: {
        hospital: { select: { hospitalName: true, email: true, adminName: true } },
      },
    });

    // Send activation email to hospital
    await transporter.sendMail({
      from:    `"Apex HMS" <${process.env.EMAIL_USER}>`,
      to:      subscription.hospital.email,
      subject: `🎉 Your Hospital Account is Now Active — Apex HMS`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1e293b;">
          <div style="background:linear-gradient(135deg,#16a34a,#15803d);padding:32px;border-radius:16px 16px 0 0;text-align:center;">
            <h1 style="color:white;margin:0;">🎉 You're All Set!</h1>
            <p style="color:#bbf7d0;margin:8px 0 0;">Your hospital account is now active</p>
          </div>
          <div style="background:#f8fafc;padding:32px;border-radius:0 0 16px 16px;border:1px solid #e2e8f0;">
            <p>Hi <strong>${subscription.hospital.adminName}</strong>,</p>
            <p>
              Great news! Your payment has been verified and your
              <strong>${subscription.plan}</strong> plan is now <strong>active</strong>.
            </p>
            <div style="background:white;border-radius:12px;padding:20px;border:1px solid #e2e8f0;margin:16px 0;">
              <p style="margin:8px 0;">✅ <strong>Plan:</strong> ${subscription.plan}</p>
              <p style="margin:8px 0;">✅ <strong>Activated:</strong> ${activatedAt.toLocaleDateString('en-NG')}</p>
              <p style="margin:8px 0;">✅ <strong>Valid until:</strong> ${expiresAt.toLocaleDateString('en-NG')}</p>
            </div>
            <div style="text-align:center;margin:24px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/hospital/auth"
                style="background:#4f46e5;color:white;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:bold;font-size:16px;">
                Login to Your Dashboard →
              </a>
            </div>
            <p style="color:#64748b;font-size:14px;">Questions? Reply to this email anytime.</p>
            <p>— The Apex HMS Team</p>
          </div>
        </div>
      `,
    });

    return res.json({
      message: `Subscription activated for ${subscription.hospital.hospitalName}.`,
      subscription,
    });

  } catch (err) {
    console.error('[PATCH /subscriptions/:hospitalId/activate]', err);
    return res.status(500).json({ error: 'Failed to activate subscription.' });
  }
});

module.exports = router;