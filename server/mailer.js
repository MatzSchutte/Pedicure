const nodemailer = require('nodemailer');

let transporter = null;
function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_PORT === '465',
      auth: process.env.SMTP_USER ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      } : undefined
    });
  }
  return transporter;
}

async function sendMail({ to, subject, text }) {
  const t = getTransporter();
  if (!t || !to) return; // e-mail is optioneel; stil overslaan als niet geconfigureerd
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || 'no-reply@pedicure-bianca.nl',
      to,
      subject,
      text
    });
  } catch (err) {
    console.error('Kon e-mail niet versturen:', err.message);
  }
}

async function notifyAdmin(subject, text) {
  const adminEmail = process.env.SMTP_USER;
  if (!adminEmail) return;
  await sendMail({ to: adminEmail, subject, text });
}

module.exports = { sendMail, notifyAdmin };
