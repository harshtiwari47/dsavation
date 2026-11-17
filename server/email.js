import nodemailer from 'nodemailer';

let transporter = null;

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error('SMTP configuration is incomplete. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS.');
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    rateLimit: 5,
  });

  return transporter;
}

function getFromAddress() {
  const fromName = process.env.EMAIL_FROM_NAME || 'Technical Team Technovation';
  const fromEmail = process.env.EMAIL_FROM_EMAIL || process.env.SMTP_USER;
  return `"${fromName}" <${fromEmail}>`;
}

export async function sendPasswordResetEmail(toEmail, toName, resetUrl, expiresAt) {
  const transporter = getTransporter();
  const from = getFromAddress();

  const expiresAtIST = new Date(expiresAt).toLocaleString('en-GB', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const subject = 'Password Reset Link';
  const text = `
Hello ${toName},

It is an auto generated password reset link for Dsavation technovation website.

Reset your password: ${resetUrl}

This link expires on ${expiresAtIST} IST (30 minutes from generation).

If you did not request this reset, please contact an administrator.

- Technical Team Technovation
  `.trim();

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset - Technical Team Technovation</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 16px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
    <!-- Header -->
    <tr>
      <td style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 20px 24px 12px 24px; text-align: center;">
        <img src="${FRONTEND_URL}/technovation-logo-tp.png" alt="Technovation Logo" style="max-width: 180px; height: auto; display: block; margin: 0 auto 8px;" />
        <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600; letter-spacing: -0.5px;">Technical Team Technovation</h1>
        <p style="margin: 4px 0 0; color: rgba(255,255,255,0.7); font-size: 14px;">Password Reset Request</p>
      </td>
    </tr>
    <!-- Body -->
    <tr>
      <td style="padding: 8px 24px 24px 24px;">
        <p style="margin: 0 0 16px; color: #1a1a2e; font-size: 16px; line-height: 1.6;">Hello <strong>${toName}</strong>,</p>
        <p style="margin: 0 0 16px; color: #333; font-size: 15px; line-height: 1.6;">It is an auto generated password reset link for Dsavation technovation website.</p>

        <!-- CTA Button (bulletproof - background on cell, works everywhere) -->
        <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 24px 0;">
          <tr>
            <td style="border-radius: 8px; background: #2563eb;" bgcolor="#2563eb" align="center">
              <a href="${resetUrl}" target="_blank" style="display: inline-block; padding: 14px 28px; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">Reset Password</a>
            </td>
          </tr>
        </table>

        <p style="margin: 16px 0 0; color: #666; font-size: 13px; line-height: 1.6;">
          Or copy this link into your browser:<br>
          <span style="word-break: break-all; color: #1a1a2e;">${resetUrl}</span>
        </p>

        <hr style="border: none; border-top: 1px solid #eaeaea; margin: 24px 0;">

        <p style="margin: 0 0 8px; color: #666; font-size: 13px; line-height: 1.6;">
          <strong>Expires:</strong> ${expiresAtIST} IST (30 minutes from generation)
        </p>
        <p style="margin: 0; color: #666; font-size: 13px; line-height: 1.6;">
          If you did not request this reset, please contact an administrator.
        </p>
      </td>
    </tr>
    <!-- Footer -->
    <tr>
      <td style="background: #fafafa; padding: 20px 24px; text-align: center; border-top: 1px solid #eaeaea;">
        <p style="margin: 0; color: #999; font-size: 12px;">&copy; Technical Team Technovation</p>
        <p style="margin: 4px 0 0; color: #bbb; font-size: 11px;">This is an automated message. Please do not reply directly to this email.</p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  try {
    const info = await transporter.sendMail({
      from,
      to: toEmail,
      subject,
      text,
      html,
    });
    console.log(`[Email] Password reset sent to ${toEmail}: ${info.messageId}`);
    return { ok: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[Email] Failed to send password reset to ${toEmail}:`, error.message);
    throw error;
  }
}

export async function verifyEmailConfig() {
  try {
    const transporter = getTransporter();
    await transporter.verify();
    console.log('[Email] SMTP configuration verified successfully');
    return true;
  } catch (error) {
    console.error('[Email] SMTP verification failed:', error.message);
    return false;
  }
}
