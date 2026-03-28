const express = require('express');
const router  = express.Router();
const nodemailer = require('nodemailer');

// ─── Email transporter ────────────────────────────────────────────────────────
// Add these to your .env:
//   EMAIL_USER=your-gmail@gmail.com
//   EMAIL_PASS=your-gmail-app-password   ← NOT your real password, use an App Password
//   NOTIFY_EMAIL=georgechiamaka02@gmail.com
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ─── POST /api/payments/proof ─────────────────────────────────────────────────
// Called when a hospital submits their bank transfer proof.
// Sends an email to the admin with all details + screenshot attached.
router.post('/proof', async (req, res) => {
  try {
    const {
      plan, planKey, amount,
      name, email, hospital, phone,
      reference,
      screenshotBase64, screenshotName,
    } = req.body;

    // Basic validation
    if (!name || !email || !phone || !reference || !screenshotBase64) {
      return res.status(400).json({ error: 'All fields including screenshot are required.' });
    }

    // Convert base64 to buffer for email attachment
    const base64Data = screenshotBase64.replace(/^data:image\/\w+;base64,/, '');
    const screenshotBuffer = Buffer.from(base64Data, 'base64');

    const submittedAt = new Date().toLocaleString('en-NG', { timeZone: 'Africa/Lagos' });

    // ── Email to YOU (admin notification) ─────────────────────────────────────
    await transporter.sendMail({
      from:    `"Apex HMS Payments" <${process.env.EMAIL_USER}>`,
      to:      process.env.NOTIFY_EMAIL || ,
      subject: `💰 New Payment Proof — ${plan} Plan | ${hospital}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
          <div style="background: linear-gradient(135deg, #4f46e5, #3b82f6); padding: 32px; border-radius: 16px 16px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">💰 New Payment Proof Received</h1>
            <p style="color: #c7d2fe; margin: 8px 0 0;">Someone has submitted payment for the <strong>${plan} Plan</strong></p>
          </div>

          <div style="background: #f8fafc; padding: 32px; border-radius: 0 0 16px 16px; border: 1px solid #e2e8f0;">

            <div style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
              <h2 style="margin: 0 0 16px; font-size: 16px; color: #4f46e5;">📋 Hospital Details</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 6px 0; color: #64748b; width: 40%;">Hospital</td><td style="padding: 6px 0; font-weight: bold;">${hospital}</td></tr>
                <tr><td style="padding: 6px 0; color: #64748b;">Admin Name</td><td style="padding: 6px 0; font-weight: bold;">${name}</td></tr>
                <tr><td style="padding: 6px 0; color: #64748b;">Email</td><td style="padding: 6px 0;"><a href="mailto:${email}">${email}</a></td></tr>
                <tr><td style="padding: 6px 0; color: #64748b;">Phone</td><td style="padding: 6px 0;">${phone}</td></tr>
              </table>
            </div>

            <div style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
              <h2 style="margin: 0 0 16px; font-size: 16px; color: #4f46e5;">💳 Payment Details</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 6px 0; color: #64748b; width: 40%;">Plan</td><td style="padding: 6px 0; font-weight: bold;">${plan}</td></tr>
                <tr><td style="padding: 6px 0; color: #64748b;">Amount</td><td style="padding: 6px 0; font-weight: bold; color: #16a34a;">${amount}/month</td></tr>
                <tr><td style="padding: 6px 0; color: #64748b;">Reference</td><td style="padding: 6px 0; font-family: monospace; background: #f1f5f9; padding: 4px 8px; border-radius: 6px;">${reference}</td></tr>
                <tr><td style="padding: 6px 0; color: #64748b;">Submitted At</td><td style="padding: 6px 0;">${submittedAt}</td></tr>
              </table>
            </div>

            <div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
              <p style="margin: 0; color: #92400e; font-weight: bold;">⚡ Action Required</p>
              <p style="margin: 8px 0 0; color: #92400e; font-size: 14px;">
                Verify the payment screenshot attached below, then activate this hospital's account in your Super Admin dashboard.
                Reply to this email or contact the hospital at <a href="mailto:${email}">${email}</a> to confirm activation.
              </p>
            </div>

            <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0;">
              Screenshot of payment receipt is attached to this email.
            </p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: screenshotName || 'payment_screenshot.png',
          content:  screenshotBuffer,
          contentType: 'image/png',
        },
      ],
    });

    // ── Confirmation email to the HOSPITAL ────────────────────────────────────
    await transporter.sendMail({
      from:    `"Apex HMS" <${process.env.EMAIL_USER}>`,
      to:      email,
      subject: `✅ Payment Proof Received — ${plan} Plan`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
          <div style="background: linear-gradient(135deg, #4f46e5, #3b82f6); padding: 32px; border-radius: 16px 16px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">✅ We Got Your Payment Proof</h1>
          </div>
          <div style="background: #f8fafc; padding: 32px; border-radius: 0 0 16px 16px; border: 1px solid #e2e8f0;">
            <p>Hi <strong>${name}</strong>,</p>
            <p>We've received your payment proof for the <strong>${plan} Plan (${amount}/month)</strong>.</p>
            <p>Here's what happens next:</p>
            <div style="background: white; border-radius: 12px; padding: 20px; border: 1px solid #e2e8f0; margin: 16px 0;">
              <p style="margin: 8px 0;">✅ We'll verify your payment (usually within a few hours)</p>
              <p style="margin: 8px 0;">✅ We'll activate your hospital account</p>
              <p style="margin: 8px 0;">✅ You'll receive a confirmation email within <strong>24 hours</strong></p>
              <p style="margin: 8px 0;">✅ Then you can login and start managing your hospital</p>
            </div>
            <p>Your payment reference: <code style="background: #f1f5f9; padding: 4px 8px; border-radius: 6px;">${reference}</code></p>
            <p style="color: #64748b; font-size: 14px;">If you have any questions, reply to this email or contact us directly.</p>
            <p>— The Apex HMS Team</p>
          </div>
        </div>
      `,
    });

    return res.json({ message: 'Payment proof submitted successfully. You will be contacted within 24 hours.' });

  } catch (err) {
    console.error('[POST /payments/proof]', err);
    return res.status(500).json({ error: 'Failed to submit payment proof. Please try again.' });
  }
});

module.exports = router;