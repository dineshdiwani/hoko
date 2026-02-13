const nodemailer = require("nodemailer");

function getTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
}

async function sendOtpEmail({ email, otp, subject }) {
  const transport = getTransport();
  if (!transport) {
    throw new Error("SMTP not configured");
  }

  const from =
    process.env.SMTP_FROM || "no-reply@hoko.app";
  const safeOtp = String(otp || "").trim();
  const brand = process.env.APP_NAME || "Hoko";
  const html = `
    <div style="font-family: Arial, sans-serif; color:#0f172a; line-height:1.5;">
      <h2 style="margin:0 0 12px;">${brand} verification code</h2>
      <p style="margin:0 0 16px;">Use the OTP below to complete your login.</p>
      <div style="font-size:28px; font-weight:700; letter-spacing:6px; padding:12px 16px; background:#f8fafc; border:1px solid #e2e8f0; display:inline-block; border-radius:10px;">
        ${safeOtp}
      </div>
      <p style="margin:16px 0 0; font-size:12px; color:#64748b;">
        This OTP is valid for a short time. If you did not request this, you can ignore this email.
      </p>
    </div>
  `;
  await transport.sendMail({
    from,
    to: email,
    subject: subject || "Your Hoko OTP",
    text: `Your OTP is ${otp}. It is valid for a short time.`,
    html
  });
}

module.exports = { sendOtpEmail };
