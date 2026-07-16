// website/fiszki-backend/src/utils/mailer.js
const nodemailer = require('nodemailer');
const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  'https://developers.google.com/oauthplayground'
);

oauth2Client.setCredentials({ refresh_token: process.env.REFRESH_TOKEN });

async function buildTransporter() {
  const { token: accessToken } = await oauth2Client.getAccessToken();

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: process.env.EMAIL_USER,
      clientId: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      refreshToken: process.env.REFRESH_TOKEN,
      accessToken,
    },
  });
}

async function sendVerificationEmail(to, otp) {
  const transporter = await buildTransporter();

  await transporter.sendMail({
    from: `"Fiszki.io" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Twój kod weryfikacyjny Fiszki.io',
    html: `
      <div style="font-family: sans-serif; max-width: 480px;">
        <h2 style="color:#4A90E2;">Fiszki.io</h2>
        <p>Twój kod weryfikacyjny:</p>
        <p style="font-size:28px; font-weight:bold; letter-spacing:4px;">${otp}</p>
        <p style="color:#888; font-size:13px;">Kod wygaśnie za 10 minut. Jeśli to nie Ty, zignoruj tę wiadomość.</p>
      </div>
    `,
  });
}

module.exports = { sendVerificationEmail };