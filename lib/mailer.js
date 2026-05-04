const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = `ApexCare <onboarding@resend.dev>`;
// ↑ Use this for testing. Once you verify a domain on resend.com,
//   change to: `ApexCare <noreply@yourdomain.com>`

// ─── Generic sendEmail (used by forgot-password) ──────────────────────────────
async function sendEmail({ to, subject, html }) {
  const { error } = await resend.emails.send({ from: FROM, to, subject, html });
  if (error) throw new Error(error.message);
}

// ─── Staff credentials email ──────────────────────────────────────────────────
async function sendStaffCredentials({ to, fullName, email, tempPassword, hospitalName, role }) {
  const roleLabel = role.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
  const { error } = await resend.emails.send({
    from: FROM,
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
  if (error) throw new Error(error.message);
}

// ─── Patient credentials email ────────────────────────────────────────────────
async function sendPatientCredentials({ to, fullName, email, tempPassword, patientNumber, hospitalName }) {
  const { error } = await resend.emails.send({
    from: FROM,
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
  if (error) throw new Error(error.message);
}

// ─── Contact form notification email ──────────────────────────────────────────
async function sendContactEmail(contact) {
  const ADMIN = process.env.GMAIL_ADMIN || process.env.GMAIL_USER;

  const { error: e1 } = await resend.emails.send({
    from: FROM,
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
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;width:42%;">Hospital Name</td>
                <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-weight:700;font-size:13px;color:#111827;">${contact.hospitalName}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;">Administrator</td>
                <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#111827;">${contact.administratorName}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;">Email</td>
                <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:13px;">
                  <a href="mailto:${contact.email}" style="color:#FF5A1F;text-decoration:none;">${contact.email}</a>
                </td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;">Phone</td>
                <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#111827;">${contact.phone}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;">Hospital Type</td>
                <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#111827;">${contact.hospitalType}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;color:#6b7280;font-size:13px;vertical-align:top;">Message</td>
                <td style="padding:10px 0;font-size:13px;color:#111827;line-height:1.7;">${contact.message.replace(/\n/g, '<br>')}</td>
              </tr>
            </table>
            <div style="margin-top:20px;padding:12px 16px;background:#f8f9fa;border-radius:8px;border:1px solid #e9ecef;">
              <p style="margin:0;font-size:11px;color:#9ca3af;">
                Submission ID: ${contact.id} &nbsp;·&nbsp; ${new Date(contact.createdAt).toUTCString()}
              </p>
            </div>
            <a href="mailto:${contact.email}?subject=Re: Your ApexCare Inquiry"
              style="display:inline-block;margin-top:20px;padding:12px 24px;background:linear-gradient(135deg,#FF5A1F,#e64d15);color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">
              Reply to ${contact.administratorName} →
            </a>
          </div>
          <div style="padding:20px 36px;border-top:1px solid #f3f4f6;background:#fafafa;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">ApexCare Admin Notification</p>
          </div>
        </div>
      </body>
      </html>
    `,
  });
  if (e1) throw new Error(e1.message);

  const { error: e2 } = await resend.emails.send({
    from: FROM,
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
              Our team will review your message and get back to you within <strong>24 hours</strong>.
            </p>
            <div style="background:#f8faff;border:1px solid #fed7aa;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
              <p style="margin:0 0 12px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Your Submission Summary</p>
              <p style="margin:0;font-size:13px;color:#374151;line-height:1.8;">
                <strong>Hospital:</strong> ${contact.hospitalName}<br>
                <strong>Type:</strong> ${contact.hospitalType}<br>
                <strong>Message:</strong><br>
                <span style="color:#6b7280;">${contact.message.replace(/\n/g, '<br>')}</span>
              </p>
            </div>
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;">
              <p style="margin:0;font-size:13px;color:#166534;">
                ✅ Your message has been saved and our team has been notified.
              </p>
            </div>
          </div>
          <div style="padding:20px 36px;border-top:1px solid #f3f4f6;background:#fafafa;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
              This is an automated confirmation. Please do not reply to this email.<br>
              © ApexCare Platform
            </p>
          </div>
        </div>
      </body>
      </html>
    `,
  });
  if (e2) throw new Error(e2.message);
}

// ─── Hospital registration pending email ──────────────────────────────────────
async function sendHospitalPendingEmail({ to, hospitalName, adminName }) {
  const { error } = await resend.emails.send({
    from: FROM,
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
              <div style="display:inline-flex;align-items:center;justify-content:center;width:72px;height:72px;background:#fffbeb;border-radius:50%;margin-bottom:16px;">
                <span style="font-size:36px;">⏳</span>
              </div>
              <h2 style="margin:0;font-size:22px;font-weight:800;color:#0A1A3F;">Registration Received!</h2>
            </div>

            <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#111827;">Hello, ${adminName} 👋</p>
            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.7;">
              Thank you for registering <strong>${hospitalName}</strong> on the ApexCare platform.
              Your application has been submitted and is currently <strong style="color:#b45309;">under review</strong> by our admin team.
            </p>

            <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
              <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:0.06em;">
                What happens next
              </p>
              <ul style="margin:0;padding:0 0 0 18px;font-size:13px;color:#374151;line-height:2.2;">
                <li>Our team will review your registration details</li>
                <li>You will receive an approval email within <strong>24 hours</strong></li>
                <li>Once approved, you can sign in and access your dashboard</li>
                <li>If we need more information, we will contact you at this email</li>
              </ul>
            </div>

            <div style="background:#f8faff;border:1px solid #e0e7ff;border-radius:10px;padding:14px 18px;">
              <p style="margin:0;font-size:13px;color:#374151;">
                📧 Questions? Reply to this email or contact us at
                <a href="mailto:support@apexcare.com" style="color:#FF5A1F;text-decoration:none;">support@apexcare.com</a>
              </p>
            </div>
          </div>

          <div style="padding:20px 36px;border-top:1px solid #f3f4f6;background:#fafafa;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
              This is an automated message from ApexCare. Please do not reply directly.<br>
              © ApexCare Platform · Powered by Anchorsoft Innovation Limited
            </p>
          </div>
        </div>
      </body>
      </html>
    `,
  });
  if (error) throw new Error(error.message);
}

// ─── Hospital approval email ──────────────────────────────────────────────────
async function sendHospitalApprovalEmail({ to, hospitalName, adminName }) {
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: `🎉 Your Hospital Has Been Approved — ApexCare`,
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
              <div style="display:inline-flex;align-items:center;justify-content:center;width:72px;height:72px;background:#f0fdf4;border-radius:50%;margin-bottom:16px;">
                <span style="font-size:36px;">✅</span>
              </div>
              <h2 style="margin:0;font-size:22px;font-weight:800;color:#0A1A3F;">You're Approved!</h2>
            </div>

            <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#111827;">Hello, ${adminName} 👋</p>
            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.7;">
              Great news! <strong>${hospitalName}</strong> has been reviewed and
              <strong style="color:#16a34a;"> approved</strong> on the ApexCare platform.
              Your hospital dashboard is now fully active and ready to use.
            </p>

            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
              <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:0.06em;">
                What you can do now
              </p>
              <ul style="margin:0;padding:0 0 0 18px;font-size:13px;color:#374151;line-height:2.2;">
                <li>Access your full hospital dashboard</li>
                <li>Add and manage staff members</li>
                <li>Register and manage patients</li>
                <li>Schedule and track appointments</li>
                <li>Manage pharmacy and medical records</li>
              </ul>
            </div>

            <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/hospital/auth"
              style="display:block;text-align:center;background:linear-gradient(135deg,#FF5A1F,#e64d15);color:#fff;text-decoration:none;padding:14px 24px;border-radius:10px;font-weight:700;font-size:15px;">
              Sign In to Your Dashboard →
            </a>
          </div>

          <div style="padding:20px 36px;border-top:1px solid #f3f4f6;background:#fafafa;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
              Welcome to the ApexCare family! Questions? Contact our support team.<br>
              © ApexCare Platform · Powered by Anchorsoft Innovation Limited
            </p>
          </div>
        </div>
      </body>
      </html>
    `,
  });
  if (error) throw new Error(error.message);
}


module.exports = {
  sendEmail,
  sendStaffCredentials,
  sendPatientCredentials,
  sendContactEmail,
  sendHospitalPendingEmail,
  sendHospitalApprovalEmail,
};