const { ApiClient, TransactionalEmailsApi, SendSmtpEmail } = require('@getbrevo/brevo');
const client = ApiClient.instance;
client.authentications['api-key'].apiKey = process.env.BREVO_API_KEY;
const transactionalApi = new TransactionalEmailsApi();
const FROM = {
    email: process.env.BREVO_SENDER_EMAIL,
    name: process.env.BREVO_SENDER_NAME || 'ApexCare',
};

// ─── Core send helper ─────────────────────────────────────────────────────────
async function sendEmail({ to, subject, html }) {
    const email = new SendSmtpEmail();  // ← no more Brevo.SendSmtpEmail
    email.sender = FROM;
    email.to = [{ email: to }];
    email.subject = subject;
    email.htmlContent = html;
    return transactionalApi.sendTransacEmail(email);
}

// ─── Email verification ───────────────────────────────────────────────────────
async function sendVerifyEmail(emailAddr, token) {
    const url = `${process.env.CLIENT_URL || 'http://localhost:5173'}/verify-email?token=${token}`;
    return sendEmail({
        to: emailAddr,
        subject: 'Verify your ApexCare account',
        html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="margin:0;padding:0;background:#f0f4fb;font-family:'Segoe UI',sans-serif;">
        <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <div style="background:linear-gradient(135deg,#0A1A3F,#1a3a7f);padding:32px 36px;">
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">ApexCare</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:14px;">Email Verification</p>
          </div>
          <div style="padding:32px 36px;">
            <div style="text-align:center;margin-bottom:28px;">
              <div style="display:inline-flex;align-items:center;justify-content:center;width:72px;height:72px;background:#f0fdf4;border-radius:50%;margin-bottom:16px;">
                <span style="font-size:36px;">✉️</span>
              </div>
              <h2 style="margin:0;font-size:22px;font-weight:800;color:#0A1A3F;">Verify your email</h2>
            </div>
            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.7;text-align:center;">
              Click the button below to verify your ApexCare account.
              This link expires in <strong>24 hours</strong>.
            </p>
            <a href="${url}"
              style="display:block;text-align:center;background:linear-gradient(135deg,#FF5A1F,#e64d15);color:#fff;text-decoration:none;padding:14px 24px;border-radius:10px;font-weight:700;font-size:15px;">
              Verify Email Address →
            </a>
            <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;text-align:center;">
              If you did not create an ApexCare account, you can safely ignore this email.
            </p>
          </div>
          <div style="padding:20px 36px;border-top:1px solid #f3f4f6;background:#fafafa;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
              © ApexCare Platform · Powered by Anchorsoft Innovation Limited
            </p>
          </div>
        </div>
      </body>
      </html>
        `,
    });
}

// ─── Staff credentials email ──────────────────────────────────────────────────
async function sendStaffCredentials({ to, fullName, email, tempPassword, hospitalName, role }) {
    const roleLabel = role.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
    return sendEmail({
        to,
        subject: `Your ${hospitalName} Staff Login Credentials`,
        html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="margin:0;padding:0;background:#f0f4fb;font-family:'Segoe UI',sans-serif;">
        <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <div style="background:linear-gradient(135deg,#0A1A3F,#1a3a7f);padding:32px 36px;">
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">ApexCare</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:14px;">Staff Portal Access</p>
          </div>
          <div style="padding:32px 36px;">
            <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#111827;">Hello, ${fullName} 👋</p>
            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
              You have been registered as a <strong>${roleLabel}</strong> at <strong>${hospitalName}</strong>.
              Use the credentials below to log in to the staff portal.
            </p>
            <div style="background:#f8faff;border:1px solid #e0e7ff;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Your Login Credentials</p>
              <div style="margin-top:14px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
                  <span style="font-size:13px;color:#6b7280;">Email / Identifier</span>
                  <span style="font-size:13px;font-weight:700;color:#111827;">${email}</span>
                </div>
                <div style="display:flex;justify-content:space-between;">
                  <span style="font-size:13px;color:#6b7280;">Temporary Password</span>
                  <span style="font-size:13px;font-weight:700;color:#FF5A1F;font-family:monospace;letter-spacing:1px;">${tempPassword}</span>
                </div>
              </div>
            </div>
            <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:14px 18px;margin-bottom:24px;">
              <p style="margin:0;font-size:13px;color:#92400e;">
                ⚠️ <strong>Please change your password</strong> after your first login for security.
              </p>
            </div>
            <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/stafflogin"
              style="display:block;text-align:center;background:linear-gradient(135deg,#FF5A1F,#e64d15);color:#fff;text-decoration:none;padding:13px 24px;border-radius:10px;font-weight:700;font-size:14px;">
              Sign In to Staff Portal →
            </a>
          </div>
          <div style="padding:20px 36px;border-top:1px solid #f3f4f6;background:#fafafa;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
              This email was sent by ${hospitalName} via ApexCare. If you did not expect this, please ignore it.
            </p>
          </div>
        </div>
      </body>
      </html>
        `,
    });
}

// ─── Patient credentials email ────────────────────────────────────────────────
async function sendPatientCredentials({ to, fullName, email, tempPassword, patientNumber, hospitalName }) {
    return sendEmail({
        to,
        subject: `Your ${hospitalName} Patient Portal Credentials`,
        html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="margin:0;padding:0;background:#f0f4fb;font-family:'Segoe UI',sans-serif;">
        <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <div style="background:linear-gradient(135deg,#0A1A3F,#1a3a7f);padding:32px 36px;">
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">ApexCare</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:14px;">Patient Portal Access</p>
          </div>
          <div style="padding:32px 36px;">
            <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#111827;">Hello, ${fullName} 👋</p>
            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
              You have been registered as a patient at <strong>${hospitalName}</strong>.
              Use the credentials below to access your patient portal.
            </p>
            <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Your Login Credentials</p>
              <div style="margin-top:14px;">
                <div style="margin-bottom:10px;display:flex;justify-content:space-between;">
                  <span style="font-size:13px;color:#6b7280;">Patient Number</span>
                  <span style="font-size:13px;font-weight:700;color:#111827;">${patientNumber}</span>
                </div>
                <div style="margin-bottom:10px;display:flex;justify-content:space-between;">
                  <span style="font-size:13px;color:#6b7280;">Email</span>
                  <span style="font-size:13px;font-weight:700;color:#111827;">${email}</span>
                </div>
                <div style="display:flex;justify-content:space-between;">
                  <span style="font-size:13px;color:#6b7280;">Temporary Password</span>
                  <span style="font-size:13px;font-weight:700;color:#FF5A1F;font-family:monospace;letter-spacing:1px;">${tempPassword}</span>
                </div>
              </div>
            </div>
            <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:14px 18px;margin-bottom:24px;">
              <p style="margin:0;font-size:13px;color:#92400e;">
                ⚠️ <strong>Please change your password</strong> after your first login for security.
              </p>
            </div>
            <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/patientlogin"
              style="display:block;text-align:center;background:linear-gradient(135deg,#FF5A1F,#e64d15);color:#fff;text-decoration:none;padding:13px 24px;border-radius:10px;font-weight:700;font-size:14px;">
              Sign In to Patient Portal →
            </a>
          </div>
          <div style="padding:20px 36px;border-top:1px solid #f3f4f6;background:#fafafa;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
              This email was sent by ${hospitalName} via ApexCare. If you did not expect this, please contact your hospital.
            </p>
          </div>
        </div>
      </body>
      </html>
        `,
    });
}

// ─── Contact form notification email ─────────────────────────────────────────
async function sendContactEmail(contact) {
    const ADMIN = process.env.ADMIN_EMAIL;

    await sendEmail({
        to: ADMIN,
        subject: `[ApexCare] New Enquiry — ${contact.hospitalName}`,
        html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="margin:0;padding:0;background:#f0f4fb;font-family:'Segoe UI',sans-serif;">
        <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <div style="background:linear-gradient(135deg,#0A1A3F,#1a3a7f);padding:32px 36px;">
            <h1 style="margin:0;color:#fff;font-size:20px;font-weight:800;">New Contact Form Submission</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">ApexCare Platform</p>
          </div>
          <div style="padding:32px 36px;">
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;width:42%;">Hospital Name</td><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-weight:700;font-size:13px;color:#111827;">${contact.hospitalName}</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;">Administrator</td><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#111827;">${contact.administratorName}</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;">Email</td><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:13px;"><a href="mailto:${contact.email}" style="color:#FF5A1F;text-decoration:none;">${contact.email}</a></td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;">Phone</td><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#111827;">${contact.phone}</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;">Hospital Type</td><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#111827;">${contact.hospitalType}</td></tr>
              <tr><td style="padding:10px 0;color:#6b7280;font-size:13px;vertical-align:top;">Message</td><td style="padding:10px 0;font-size:13px;color:#111827;line-height:1.7;">${contact.message.replace(/\n/g, '<br>')}</td></tr>
            </table>
          </div>
        </div>
      </body>
      </html>
        `,
    });

    await sendEmail({
        to: contact.email,
        subject: `We received your inquiry — ApexCare`,
        html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="margin:0;padding:0;background:#f0f4fb;font-family:'Segoe UI',sans-serif;">
        <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <div style="background:linear-gradient(135deg,#0A1A3F,#1a3a7f);padding:32px 36px;">
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">ApexCare</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:14px;">We've received your inquiry</p>
          </div>
          <div style="padding:32px 36px;">
            <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#111827;">Hello, ${contact.administratorName} 👋</p>
            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
              Thank you for reaching out about <strong>${contact.hospitalName}</strong>.
              Our team will review your message and get back to you within one business day.
            </p>
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;">
              <p style="margin:0;font-size:13px;color:#166534;">
                ✅ Your message has been saved and our team has been notified.
              </p>
            </div>
          </div>
          <div style="padding:20px 36px;border-top:1px solid #f3f4f6;background:#fafafa;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">© ApexCare Platform</p>
          </div>
        </div>
      </body>
      </html>
        `,
    });
}

// ─── Hospital pending email ───────────────────────────────────────────────────
async function sendHospitalPendingEmail({ to, hospitalName, adminName }) {
    return sendEmail({
        to,
        subject: `Registration Received — ApexCare`,
        html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="margin:0;padding:0;background:#f0f4fb;font-family:'Segoe UI',sans-serif;">
        <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <div style="background:linear-gradient(135deg,#0A1A3F,#1a3a7f);padding:32px 36px;">
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">ApexCare</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:14px;">Hospital Management System</p>
          </div>
          <div style="padding:32px 36px;">
            <div style="text-align:center;margin-bottom:28px;">
              <span style="font-size:48px;">⏳</span>
              <h2 style="margin:8px 0 0;font-size:22px;font-weight:800;color:#0A1A3F;">Registration Received!</h2>
            </div>
            <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#111827;">Hello, ${adminName} 👋</p>
            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.7;">
              Thank you for registering <strong>${hospitalName}</strong>. Your application is currently
              <strong style="color:#b45309;">under review</strong> by our admin team.
            </p>
            <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:12px;padding:20px 24px;">
              <ul style="margin:0;padding:0 0 0 18px;font-size:13px;color:#374151;line-height:2.2;">
                <li>Our team will review your registration details</li>
                <li>You will receive an approval email once complete</li>
                <li>Once approved, you can sign in and access your dashboard</li>
              </ul>
            </div>
          </div>
          <div style="padding:20px 36px;border-top:1px solid #f3f4f6;background:#fafafa;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
              © ApexCare Platform · Powered by Anchorsoft Innovation Limited
            </p>
          </div>
        </div>
      </body>
      </html>
        `,
    });
}

// ─── Hospital approval email ──────────────────────────────────────────────────
async function sendHospitalApprovalEmail({ to, hospitalName, adminName }) {
    return sendEmail({
        to,
        subject: `Your Hospital Has Been Approved — ApexCare`,
        html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="margin:0;padding:0;background:#f0f4fb;font-family:'Segoe UI',sans-serif;">
        <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <div style="background:linear-gradient(135deg,#0A1A3F,#1a3a7f);padding:32px 36px;">
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">ApexCare</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:14px;">Hospital Management System</p>
          </div>
          <div style="padding:32px 36px;">
            <div style="text-align:center;margin-bottom:28px;">
              <span style="font-size:48px;">✅</span>
              <h2 style="margin:8px 0 0;font-size:22px;font-weight:800;color:#0A1A3F;">You're Approved!</h2>
            </div>
            <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#111827;">Hello, ${adminName} 👋</p>
            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.7;">
              <strong>${hospitalName}</strong> has been <strong style="color:#16a34a;">approved</strong> on ApexCare.
              Your dashboard is now fully active.
            </p>
            <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/hospital/auth"
              style="display:block;text-align:center;background:linear-gradient(135deg,#FF5A1F,#e64d15);color:#fff;text-decoration:none;padding:14px 24px;border-radius:10px;font-weight:700;font-size:15px;">
              Sign In to Your Dashboard →
            </a>
          </div>
          <div style="padding:20px 36px;border-top:1px solid #f3f4f6;background:#fafafa;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
              © ApexCare Platform · Powered by Anchorsoft Innovation Limited
            </p>
          </div>
        </div>
      </body>
      </html>
        `,
    });
}

// ─── Hospital suspension email ────────────────────────────────────────────────
async function sendHospitalSuspensionEmail({ to, hospitalName, adminName }) {
    return sendEmail({
        to,
        subject: `Your Hospital Has Been Suspended — ApexCare`,
        html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="margin:0;padding:0;background:#f0f4fb;font-family:'Segoe UI',sans-serif;">
        <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <div style="background:linear-gradient(135deg,#0A1A3F,#1a3a7f);padding:32px 36px;">
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:800;">ApexCare</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:14px;">Account Notice</p>
          </div>
          <div style="padding:32px 36px;">
            <div style="text-align:center;margin-bottom:28px;">
              <span style="font-size:48px;">⛔</span>
              <h2 style="margin:8px 0 0;font-size:22px;font-weight:800;color:#0A1A3F;">Account Suspended</h2>
            </div>
            <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#111827;">Hello, ${adminName} 👋</p>
            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.7;">
              Your hospital <strong>${hospitalName}</strong> has been <strong style="color:#be123c;">suspended</strong>.
              Access to your dashboard has been temporarily disabled.
            </p>
            <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
              <ul style="margin:0;padding:0 0 0 18px;font-size:13px;color:#374151;line-height:2.2;">
                <li>Staff logins are disabled</li>
                <li>Patient portal access is restricted</li>
                <li>Your data is safe and preserved</li>
              </ul>
            </div>
            <div style="background:#f8faff;border:1px solid #e0e7ff;border-radius:10px;padding:14px 18px;">
              <p style="margin:0;font-size:13px;color:#374151;">
                📧 Contact us at <a href="mailto:support@apexcare.com" style="color:#FF5A1F;">support@apexcare.com</a>
              </p>
            </div>
          </div>
          <div style="padding:20px 36px;border-top:1px solid #f3f4f6;background:#fafafa;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">© ApexCare Platform · Powered by Anchorsoft Innovation Limited</p>
          </div>
        </div>
      </body>
      </html>
        `,
    });
}

// ─── Hospital rejection email ─────────────────────────────────────────────────
async function sendHospitalRejectionEmail({ to, hospitalName, adminName }) {
    return sendEmail({
        to,
        subject: `Registration Update — ApexCare`,
        html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="margin:0;padding:0;background:#f0f4fb;font-family:'Segoe UI',sans-serif;">
        <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <div style="background:linear-gradient(135deg,#0A1A3F,#1a3a7f);padding:32px 36px;">
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:800;">ApexCare</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:14px;">Registration Status</p>
          </div>
          <div style="padding:32px 36px;">
            <div style="text-align:center;margin-bottom:28px;">
              <span style="font-size:48px;">❌</span>
              <h2 style="margin:8px 0 0;font-size:22px;font-weight:800;color:#0A1A3F;">Registration Not Approved</h2>
            </div>
            <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#111827;">Hello, ${adminName} 👋</p>
            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.7;">
              After reviewing your registration for <strong>${hospitalName}</strong>, we are unable to approve
              your application at this time.
            </p>
            <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:12px;padding:18px 22px;margin-bottom:24px;">
              <p style="margin:0;font-size:13px;color:#92400e;line-height:1.7;">
                If you believe this is a mistake, please contact our support team to reapply.
              </p>
            </div>
            <a href="mailto:support@apexcare.com"
              style="display:block;text-align:center;background:linear-gradient(135deg,#FF5A1F,#e64d15);color:#fff;text-decoration:none;padding:13px 24px;border-radius:10px;font-weight:700;font-size:14px;">
              Contact Support →
            </a>
          </div>
          <div style="padding:20px 36px;border-top:1px solid #f3f4f6;background:#fafafa;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">© ApexCare Platform · Powered by Anchorsoft Innovation Limited</p>
          </div>
        </div>
      </body>
      </html>
        `,
    });
}

module.exports = {
    sendEmail,
    sendVerifyEmail,
    sendStaffCredentials,
    sendPatientCredentials,
    sendContactEmail,
    sendHospitalPendingEmail,
    sendHospitalApprovalEmail,
    sendHospitalSuspensionEmail,
    sendHospitalRejectionEmail,
};