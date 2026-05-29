require('dotenv').config();

// ⚠️ Permitir certificados SSL problemáticos
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const {
  app,
  BrowserWindow,
  ipcMain,
  Notification
} = require('electron');

const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const axios = require('axios');
const https = require('https');


const log = require('electron-log');
const { autoUpdater } = require('electron-updater');

/* =========================
   LOGS
========================= */
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

autoUpdater.logger = log;
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

let mainWindow;

/* =========================
   EVITAR ALERTAS REPETIDAS
========================= */
const alertedSites = new Set();

/* =========================
   EMAIL CONFIG
========================= */
const transporter = nodemailer.createTransport({
  service: 'gmail',

  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/* =========================
   ENVIAR ALERTA EMAIL
========================= */
async function sendAlertEmail(downSites) {

  try {

    if (!downSites || downSites.length === 0) {
      return;
    }

    console.log(
      `📩 Enviando alerta (${downSites.length} sitios)`
    );

    const html = `
      <div style="font-family: Arial, sans-serif;">

        <h2 style="color:#d32f2f;">
          ⚠️ Sitios caídos detectados
        </h2>

        <table
          border="1"
          cellpadding="8"
          cellspacing="0"
          style="border-collapse: collapse; width:100%;"
        >

          <thead style="background:#f5f5f5;">
            <tr>
              <th>Sitio</th>
              <th>URL</th>
              <th>Error</th>
              <th>Status</th>
              <th>Tiempo</th>
            </tr>
          </thead>

          <tbody>

            ${downSites.map(site => `
              <tr>

                <td>
                  ${site.name || 'Sin nombre'}
                </td>

                <td>
                  <a href="${site.url}">
                    ${site.url}
                  </a>
                </td>

                <td style="color:red;">
                  ${site.error || 'Sin detalle'}
                </td>

                <td>
                  ${site.statusCode || 0}
                </td>

                <td>
                  ${site.responseTime || 0} ms
                </td>

              </tr>
            `).join('')}

          </tbody>

        </table>

        <p style="margin-top:20px;color:#666;font-size:12px;">
          Generado automáticamente por el monitor de URLs.
        </p>

      </div>
    `;

    await transporter.verify();

    // Destinatarios: EMAIL_TO (separados por coma) o EMAIL_USER como fallback
    const recipients = process.env.EMAIL_TO || process.env.EMAIL_USER;

    await transporter.sendMail({
      from: `"Monitor de URLs" <${process.env.EMAIL_USER}>`,
      to: recipients,
      subject: `⚠️ ${downSites.length} sitio(s) caído(s) detectado(s)`,
      html
    });

    console.log('✅ Correo enviado');

  } catch (error) {

    console.error(
      '❌ Error enviando correo:'
    );

    console.error(
      error.message
    );
  }
}

/* =========================
   VERIFICAR SITIO
========================= */
async function checkStatus(url, name = '') {

  const startTime = Date.now();

  try {

    // ✅ Validar URL
    if (!url || typeof url !== 'string') {

      return {
        name: name || 'Sin nombre',
        url: '',

        status: 'inactive',

        statusCode: 0,

        statusText: 'URL inválida',

        responseTime: 0,

        error: 'URL inválida'
      };
    }


    // ✅ Limpiar espacios
    url = url.trim();

    // ✅ Agregar protocolo automáticamente
    if (
      !url.startsWith('http://') &&
      !url.startsWith('https://')
    ) {
      url = `https://${url}`;
    }

    console.log(`🔎 Revisando: ${url}`);

    const response = await axios({

      method: 'GET',

      url,

      timeout: 20000,

      timeoutErrorMessage: 'Timeout',

      maxRedirects: 10,

      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
        keepAlive: false
      }),

      validateStatus: () => true,

      headers: {

        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36',

        'Accept':
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',

        'Accept-Language':
          'es-MX,es;q=0.9',

        'Cache-Control':
          'no-cache',

        'Pragma':
          'no-cache'
      }
    });

    const responseTime =
      Date.now() - startTime;

    console.log(
      `✅ ${url} -> ${response.status}`
    );

    // ✅ Considerar activo casi cualquier respuesta
    const isUp =
      response.status >= 200 &&
      response.status < 600;

    return {

      name,
      url,

      status:
        isUp
          ? 'active'
          : 'inactive',

      statusCode:
        response.status,

      statusText:
        response.statusText ||
        `HTTP ${response.status}`,

      responseTime,

      error:
        isUp
          ? null
          : `HTTP ${response.status}`
    };

  } catch (error) {

    const responseTime =
      Date.now() - startTime;

    console.log('====================');
    console.log(`❌ ${url}`);
    console.log('MESSAGE:', error.message);
    console.log('CODE:', error.code);
    console.log('====================');

    // ✅ Algunos errores NO significan caído
    const recoverableErrors = [

      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNABORTED',

      'ERR_BAD_SSL_CLIENT_AUTH_CERT',
      'DEPTH_ZERO_SELF_SIGNED_CERT',

      'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
    ];

    const isProbablyUp =
      recoverableErrors.includes(error.code);

    return {

      name,
      url,

      status:
        isProbablyUp
          ? 'active'
          : 'inactive',

      statusCode: 0,

      responseTime,

      error:
        error.code ||
        error.message ||
        'Unknown error'
    };
  }
}

/* =========================
   MONITOREAR SITIOS
========================= */
async function checkSites(sites) {

  console.log(
    `🚀 Iniciando revisión de ${sites.length} sitios`
  );

  const results = [];

  // ⚠️ Secuencial para evitar bloqueos
  for (const site of sites) {
    console.log(site);

    const result = await checkStatus(
      site.url,
      site.name
    );

    results.push(result);

    console.log(
      `✔ ${site.name}: ${result.status}`
    );
  }

  const downSites = results.filter(
    s => s.status === 'inactive'
  );

  console.log(
    `✅ Activos: ${results.filter(
      s => s.status === 'active'
    ).length
    }`
  );

  console.log(
    `❌ Inactivos: ${downSites.length}`
  );

  /* =========================
     EVITAR ALERTAS REPETIDAS
  ========================= */
  const newDownSites =
    downSites.filter(site => {

      if (
        alertedSites.has(site.url)
      ) {
        return false;
      }

      alertedSites.add(site.url);

      return true;
    });

  /* =========================
     LIMPIAR RECUPERADOS
  ========================= */
  results.forEach(site => {

    if (
      site.status === 'active'
    ) {
      alertedSites.delete(site.url);
    }
  });

  /* =========================
     ENVIAR ALERTA
  ========================= */
  if (newDownSites.length > 0) {

    await sendAlertEmail(
      newDownSites
    );
  }

  return results;
}

/* =========================
   WINDOW
========================= */
function createWindow() {

  mainWindow = new BrowserWindow({

    width: 1200,
    height: 800,

    minWidth: 900,
    minHeight: 600,

    backgroundColor: '#0f172a',

    // ✅ Mostrar inmediatamente para debug
    show: true,

    webPreferences: {
      preload: path.join(
        __dirname,
        'preload.js'
      ),

      contextIsolation: true,

      nodeIntegration: false
    }
  });

  // ✅ Cargar HTML
  mainWindow.loadFile(
    path.join(
      __dirname,
      'index.html'
    )
  );


  mainWindow.webContents.on(
    'console-message',
    (event, level, message, line, sourceId) => {

      console.log('🖥️ RENDERER LOG:');
      console.log(message);
      console.log('LINE:', line);
      console.log('SOURCE:', sourceId);
    }
  );

  // ✅ Detectar errores de carga
  mainWindow.webContents.on(
    'did-fail-load',
    (event, errorCode, errorDescription) => {

      console.log(
        '❌ Error cargando ventana:',
        errorCode,
        errorDescription
      );
    }
  );

  // ✅ Detectar crashes del renderer
  mainWindow.webContents.on(
    'render-process-gone',
    (event, details) => {

      console.log(
        '❌ Renderer crashed:',
        details
      );
    }
  );

  // ✅ AutoUpdater
  if (app.isPackaged) {
    setupAutoUpdater();
  }
}

/* =========================
   IPC
========================= */
ipcMain.handle(
  'check-sites',
  async (event, sites) => {

    console.log('====================');
    console.log('IPC check-sites');
    console.log('TOTAL:', sites?.length);
    console.log(sites);
    console.log('====================');

    return await checkSites(sites);
  }
);

ipcMain.handle(
  'check-status',
  async (event, site) => {

    return await checkStatus(
      site.url,
      site.name
    );
  }
);

ipcMain.handle(
  'show-notification',
  (
    event,
    { title, body }
  ) => {

    if (
      Notification.isSupported()
    ) {

      new Notification({
        title,
        body
      }).show();
    }
  }
);

ipcMain.handle(
  'report-results',
  async (event, results) => {
    if (!results || !Array.isArray(results)) return;

    const downSites = results.filter(
      s => s.status === 'inactive'
    );

    // Filter out sites that are already alerted
    const newDownSites = downSites.filter(site => {
      if (alertedSites.has(site.url)) {
        return false;
      }
      alertedSites.add(site.url);
      return true;
    });

    // Remove from alerted list those that recovered (are active now)
    results.forEach(site => {
      if (site.status === 'active') {
        alertedSites.delete(site.url);
      }
    });

    // Send email alert if there are new down sites
    if (newDownSites.length > 0) {
      await sendAlertEmail(newDownSites);
    }
  }
);

ipcMain.handle(
  'get-app-version',
  () => {

    return app.getVersion();
  }
);

ipcMain.handle(
  'load-sites-file',
  async () => {

    try {

      const filePath = path.join(
        __dirname,
        'sitios.json'
      );

      console.log('📂 Cargando sitios.json');
      console.log(filePath);

      if (
        !fs.existsSync(filePath)
      ) {

        fs.writeFileSync(
          filePath,
          '[]',
          'utf8'
        );
      }

      const data = fs.readFileSync(
        filePath,
        'utf8'
      );

      return JSON.parse(data);

    } catch (error) {

      console.error(error);

      return {
        error: error.message
      };
    }
  }
);

ipcMain.handle(
  'edit-sites-file',
  async () => {

    const { shell } = require('electron');

    const filePath = path.join(
      __dirname,
      'sitios.json'
    );

    shell.openPath(filePath);
  }
);

ipcMain.handle(
  'install-update',
  () => {

    autoUpdater.quitAndInstall();
  }
);

/* =========================
   AUTO UPDATER
========================= */
function setupAutoUpdater() {

  autoUpdater.on(
    'checking-for-update',
    () => {

      mainWindow.webContents.send(
        'update-status',
        {
          status: 'checking'
        }
      );
    }
  );

  autoUpdater.on(
    'update-available',
    info => {

      mainWindow.webContents.send(
        'update-status',
        {
          status: 'available',
          version: info.version
        }
      );
    }
  );

  autoUpdater.on(
    'update-not-available',
    info => {

      mainWindow.webContents.send(
        'update-status',
        {
          status: 'not-available',
          version: info.version
        }
      );
    }
  );

  autoUpdater.on(
    'download-progress',
    progress => {

      mainWindow.webContents.send(
        'update-status',
        {
          status: 'downloading',
          percent: progress.percent
        }
      );
    }
  );

  autoUpdater.on(
    'update-downloaded',
    info => {

      mainWindow.webContents.send(
        'update-status',
        {
          status: 'downloaded',
          version: info.version
        }
      );
    }
  );

  autoUpdater.checkForUpdatesAndNotify();
}

/* =========================
   APP
========================= */
app.whenReady().then(() => {

  createWindow();
});

app.on(
  'window-all-closed',
  () => {

    if (
      process.platform !== 'darwin'
    ) {
      app.quit();
    }
  }
);