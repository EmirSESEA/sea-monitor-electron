const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

async function sendDownSitesEmail(downSites) {
    if (!downSites.length) return;

    const htmlList = downSites
        .map(site => `
      <tr>
        <td style="padding:8px;border:1px solid #ccc;">${site.name}</td>
        <td style="padding:8px;border:1px solid #ccc;">${site.url}</td>
        <td style="padding:8px;border:1px solid #ccc;color:red;">
          ${site.error}
        </td>
      </tr>
    `)
        .join('');

    const mailOptions = {
        from: `"Monitor de URLs" <${process.env.EMAIL_USER}>`,
        to: 'aegarciam@guanajuato.gob.mx',
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

    await transporter.sendMail(mailOptions);

    console.log('Correo enviado');
}

module.exports = {
    sendDownSitesEmail
};