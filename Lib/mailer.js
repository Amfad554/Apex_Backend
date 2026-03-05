const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD, // App Password, NOT your Gmail password
    },
});

// ── Staff credentials email ──────────────────────────────────────────────────
async function sendStaffCredentials({ to, fullName, email, tempPassword, hospitalName, role }) {
    const roleLabel = role.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
    await transporter.sendMail({
        from: `"HMSCare" <${process.env.GMAIL_USER}>`,
        to,
        subject: `Your ${hospitalName} Staff Login Credentials`,
        html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="margin:0;padding:0;background:#f0f4fb;font-family:'Segoe UI',sans-serif;">
        <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <div style="background:linear-gradient(135deg,#3b5bdb,#228be6);padding:32px 36px;">
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">HMSCare</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:14px;">Staff Portal Access</p>
          </div>

          <!-- Body -->
          <div style="padding:32px 36px;">
            <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#111827;">Hello, ${fullName} 👋</p>
            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
              You have been registered as a <strong>${roleLabel}</strong> at <strong>${hospitalName}</strong>. 
              Use the credentials below to log in to the staff portal.
            </p>

            <!-- Credentials Box -->
            <div style="background:#f8faff;border:1px solid #e0e7ff;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Your Login Credentials</p>
              <div style="margin-top:14px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
                  <span style="font-size:13px;color:#6b7280;">Email / Identifier</span>
                  <span style="font-size:13px;font-weight:700;color:#111827;">${email}</span>
                </div>
                <div style="display:flex;justify-content:space-between;">
                  <span style="font-size:13px;color:#6b7280;">Temporary Password</span>
                  <span style="font-size:13px;font-weight:700;color:#3b5bdb;font-family:monospace;letter-spacing:1px;">${tempPassword}</span>
                </div>
              </div>
            </div>

            <!-- Warning -->
            <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:14px 18px;margin-bottom:24px;">
              <p style="margin:0;font-size:13px;color:#92400e;">
                ⚠️ <strong>Please change your password</strong> after your first login for security.
              </p>
            </div>

            <!-- CTA -->
            <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/stafflogin" 
              style="display:block;text-align:center;background:linear-gradient(135deg,#3b5bdb,#228be6);color:#fff;text-decoration:none;padding:13px 24px;border-radius:10px;font-weight:700;font-size:14px;">
              Sign In to Staff Portal →
            </a>
          </div>

          <!-- Footer -->
          <div style="padding:20px 36px;border-top:1px solid #f3f4f6;background:#fafafa;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
              This email was sent by ${hospitalName} via HMSCare. If you did not expect this, please ignore it.
            </p>
          </div>
        </div>
      </body>
      </html>
    `,
    });
}

// ── Patient credentials email ────────────────────────────────────────────────
async function sendPatientCredentials({ to, fullName, email, tempPassword, patientNumber, hospitalName }) {
    await transporter.sendMail({
        from: `"HMSCare" <${process.env.GMAIL_USER}>`,
        to,
        subject: `Your ${hospitalName} Patient Portal Credentials`,
        html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="margin:0;padding:0;background:#f0f4fb;font-family:'Segoe UI',sans-serif;">
        <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header -->
          <div style="background:linear-gradient(135deg,#ec4899,#f472b6);padding:32px 36px;">
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">HMSCare</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:14px;">Patient Portal Access</p>
          </div>

          <!-- Body -->
          <div style="padding:32px 36px;">
            <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#111827;">Hello, ${fullName} 👋</p>
            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
              You have been registered as a patient at <strong>${hospitalName}</strong>.
              Use the credentials below to access your patient portal.
            </p>

            <!-- Credentials Box -->
            <div style="background:#fdf2f8;border:1px solid #fbcfe8;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
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
                  <span style="font-size:13px;font-weight:700;color:#ec4899;font-family:monospace;letter-spacing:1px;">${tempPassword}</span>
                </div>
              </div>
            </div>

            <!-- Warning -->
            <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:14px 18px;margin-bottom:24px;">
              <p style="margin:0;font-size:13px;color:#92400e;">
                ⚠️ <strong>Please change your password</strong> after your first login for security.
              </p>
            </div>

            <!-- CTA -->
            <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/patientlogin"
              style="display:block;text-align:center;background:linear-gradient(135deg,#ec4899,#f472b6);color:#fff;text-decoration:none;padding:13px 24px;border-radius:10px;font-weight:700;font-size:14px;">
              Sign In to Patient Portal →
            </a>
          </div>

          <!-- Footer -->
          <div style="padding:20px 36px;border-top:1px solid #f3f4f6;background:#fafafa;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
              This email was sent by ${hospitalName} via HMSCare. If you did not expect this, please contact your hospital.
            </p>
          </div>
        </div>
      </body>
      </html>
    `,
    });
}

module.exports = { sendStaffCredentials, sendPatientCredentials };