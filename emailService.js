const nodemailer = require('nodemailer');

function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
}

const safe = (text) =>
  String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

async function sendDownSitesEmail(downSites) {
  if (!downSites.length) return;

  const transporter = createTransporter();

  const htmlList = downSites.map(site => `
    <tr>
      <td style="padding:8px;border:1px solid #ccc;">
        ${safe(site.name)}
      </td>

      <td style="padding:8px;border:1px solid #ccc;">
        ${safe(site.url)}
      </td>

      <td style="padding:8px;border:1px solid #ccc;color:red;">
        ${safe(site.error)}
      </td>
    </tr>
  `).join('');

  const mailOptions = {
    from: `"Monitor de URLs" <${process.env.EMAIL_USER}>`,
    to: process.env.EMAIL_USER,
    subject: '⚠️ Sitios caídos detectados',

    html: `
      <h2>Se detectaron sitios caídos</h2>

      <table style="border-collapse:collapse;width:100%;">
        <thead>
          <tr>
            <th style="padding:8px;border:1px solid #ccc;">Nombre</th>
            <th style="padding:8px;border:1px solid #ccc;">URL</th>
            <th style="padding:8px;border:1px solid #ccc;">Error</th>
          </tr>
        </thead>

        <tbody>
          ${htmlList}
        </tbody>
      </table>
    `
  };

  try {
    console.log('Verificando conexión SMTP...');

    await transporter.verify();

    console.log('Enviando correo...');

    await transporter.sendMail(mailOptions);

    console.log('Correo enviado');

  } catch (error) {
    console.error('Error enviando correo:', error);
  }
}

module.exports = {
  sendDownSitesEmail
};