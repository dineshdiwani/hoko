const nodemailer = require("nodemailer");

function isValidEmail(value) {
  return /\S+@\S+\.\S+/.test(String(value || "").trim());
}

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

function resolveSender() {
  const smtpUser = String(process.env.SMTP_USER || "").trim();
  const smtpFrom = String(process.env.SMTP_FROM || "").trim();
  const smtpReplyTo = String(process.env.SMTP_REPLY_TO || "").trim();
  const smtpEnvelopeFrom = String(process.env.SMTP_ENVELOPE_FROM || "").trim();
  const appName = String(process.env.APP_NAME || "Hoko").trim() || "Hoko";
  const authAddress = isValidEmail(smtpUser) ? smtpUser : "";
  const requestedFrom = isValidEmail(smtpFrom) ? smtpFrom : "";
  const requestedReplyTo = isValidEmail(smtpReplyTo) ? smtpReplyTo : "";
  const requestedEnvelopeFrom = isValidEmail(smtpEnvelopeFrom)
    ? smtpEnvelopeFrom
    : "";

  const visibleFromEmail = requestedFrom || authAddress || "no-reply@hoko.app";
  const envelopeFrom =
    requestedEnvelopeFrom || visibleFromEmail || authAddress || "no-reply@hoko.app";
  const from = `${appName} <${visibleFromEmail}>`;
  const replyTo =
    requestedReplyTo ||
    (requestedFrom &&
    authAddress &&
    requestedFrom.toLowerCase() !== authAddress.toLowerCase()
      ? requestedFrom
      : undefined);

  return {
    from,
    envelopeFrom,
    replyTo
  };
}

async function sendOtpEmail({ email, otp, subject }) {
  const transport = getTransport();
  if (!transport) {
    throw new Error("SMTP not configured");
  }

  const sender = resolveSender();
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
  const info = await transport.sendMail({
    from: sender.from,
    to: email,
    envelope: {
      from: sender.envelopeFrom,
      to: email
    },
    ...(sender.replyTo ? { replyTo: sender.replyTo } : {}),
    subject: subject || "Your Hoko OTP",
    text: `Your OTP is ${otp}. It is valid for a short time.`,
    html
  });
  return {
    ok: Array.isArray(info?.accepted) ? info.accepted.length > 0 : true,
    accepted: info?.accepted || [],
    rejected: info?.rejected || [],
    response: info?.response || ""
  };
}

async function sendEmailToRecipient({ to, subject, text, html }) {
  const transport = getTransport();
  const target = String(to || "").trim();
  if (!transport || !target || !isValidEmail(target)) {
    return { ok: false, skipped: true, reason: "email_not_configured_or_invalid" };
  }

  const sender = resolveSender();
  const info = await transport.sendMail({
    from: sender.from,
    to: target,
    envelope: {
      from: sender.envelopeFrom,
      to: target
    },
    ...(sender.replyTo ? { replyTo: sender.replyTo } : {}),
    subject: String(subject || "Hoko notification").slice(0, 180),
    text: String(text || "").trim() || "Hoko event notification",
    html:
      html ||
      `<div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5;white-space:pre-line;">${String(
        text || ""
      )}</div>`
  });
  return {
    ok: Array.isArray(info?.accepted) ? info.accepted.length > 0 : true,
    accepted: info?.accepted || [],
    rejected: info?.rejected || [],
    response: info?.response || ""
  };
}

function getAdminNotificationEmail() {
  const raw =
    process.env.ADMIN_NOTIFICATION_EMAIL ||
    process.env.ADMIN_ALERT_EMAIL ||
    process.env.ADMIN_EMAIL ||
    "admin@hokoapp.in";
  const email = String(raw || "").trim();
  if (!email || !/\S+@\S+\.\S+/.test(email)) return "";
  return email;
}

async function sendAdminEventEmail({ subject, text, html }) {
  const to = getAdminNotificationEmail();
  if (!to) {
    return { ok: false, skipped: true, reason: "email_not_configured" };
  }
  return sendEmailToRecipient({ to, subject, text, html });
}

module.exports = { sendOtpEmail, sendAdminEventEmail, sendEmailToRecipient };
