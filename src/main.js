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

    console.log(`📩 Enviando alerta (${downSites.length} sitios)`);

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
    console.error('❌ Error enviando correo:');
    console.error(error.message);
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
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }

    console.log(`🔎 Revisando: ${url}`);

    // Configuración base compartida para ambas peticiones
    const configBase = {
      url,
      timeout: 20000,
      decompress: false,
      timeoutErrorMessage: 'Timeout',
      maxRedirects: 10,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
        keepAlive: false
      }),
      validateStatus: () => true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    };

    let response;
    try {
      // 🚀 PLAN A: Intentar método HEAD (Súper rápido y sin descargar basura)
      response = await axios({ method: 'HEAD', ...configBase });

      // Si el servidor responde que no soporta HEAD (405) o no está implementado (501)
      if (response.status === 405 || response.status === 501) {
        console.log(`⚠️ Método HEAD no permitido por el servidor en ${url}. Aplicando Plan B (GET)...`);
        response = await axios({ method: 'GET', ...configBase });
      }
    } catch (error) {
      // Si falla por completo el HEAD por alguna configuración rara de red, intentamos GET antes de darlo por muerto
      console.log(`🔄 Error en HEAD para ${url}, reintentando con GET...`);
      response = await axios({ method: 'GET', ...configBase });
    }

    const responseTime = Date.now() - startTime;
    console.log(`✅ ${url} -> ${response.status}`);

    // Un sitio está ACTIVO si responde exitosamente (2xx/3xx) o si el servidor deniega el acceso pero responde (401, 403, 405).
    const allowedErrorStatuses = [401, 403, 405];

    const isUp =
      (response.status >= 200 && response.status < 400) ||
      allowedErrorStatuses.includes(response.status);

    // Personalizar el texto descriptivo para el Front-end si es un 403
    let statusText = response.statusText || `HTTP ${response.status}`;
    if (response.status === 403) {
      statusText = 'Activo (Protegido/403)';
    } else if (response.status === 401) {
      statusText = 'Activo (Requiere Auth/401)';
    }

    return {
      name,
      url,
      status: isUp ? 'active' : 'inactive',
      statusCode: response.status,
      statusText: statusText,
      responseTime,
      error: isUp ? null : `HTTP ${response.status}`
    };

  } catch (error) {
    const responseTime = Date.now() - startTime;

    console.log('====================');
    console.log(`❌ ${url}`);
    console.log('MESSAGE:', error.message);
    console.log('CODE:', error.code);
    console.log('====================');

    // ✅ Algunos errores de red/SSL no significan que el servidor esté muerto
    const recoverableErrors = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNABORTED',
      'ERR_BAD_SSL_CLIENT_AUTH_CERT',
      'DEPTH_ZERO_SELF_SIGNED_CERT',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      'Z_DATA_ERROR'
    ];

    const isProbablyUp = recoverableErrors.includes(error.code);

    return {
      name,
      url,
      status: isProbablyUp ? 'active' : 'inactive',
      statusCode: 0,
      statusText: error.code || error.message || 'Sin conexión',
      responseTime,
      error: error.code || error.message || 'Unknown error'
    };
  }
}

/* =========================
   MONITOREAR SITIOS
========================= */
async function checkSites(sites, isBackground = false) {
  if (!sites || sites.length === 0) return [];

  console.log(`🚀 Iniciando revisión de ${sites.length} sitios ${isBackground ? '(En segundo plano)' : ''}`);
  const results = [];

  // Secuencial para evitar bloqueos por ráfagas
  for (const site of sites) {
    const result = await checkStatus(site.url, site.name);
    results.push(result);
    console.log(`✔ ${site.name}: ${result.status}`);
  }

  const downSites = results.filter(s => s.status === 'inactive');

  console.log(`✅ Activos: ${results.filter(s => s.status === 'active').length}`);
  console.log(`❌ Inactivos: ${downSites.length}`);

  /* =======================================================
     MODIFICACIÓN: NOTIFICAR SIEMPRE SI SIGUE CAÍDO
     ======================================================= */
  // Si se ejecuta en segundo plano por el temporizador, te enviará 
  // un correo cada 5/10 min con TODOS los sitios que sigan caídos.
  if (isBackground) {
    if (downSites.length > 0) {
      await sendAlertEmail(downSites);
    }
  } else {
    // Si viene del Front-end (clic manual), mantiene tu filtro original anti-repetición
    const newDownSites = downSites.filter(site => {
      if (alertedSites.has(site.url)) return false;
      alertedSites.add(site.url);
      return true;
    });

    if (newDownSites.length > 0) {
      await sendAlertEmail(newDownSites);
    }
  }

  /* =========================
     LIMPIAR RECUPERADOS
  ========================= */
  results.forEach(site => {
    if (site.status === 'active') {
      alertedSites.delete(site.url);
    }
  });

  // Si la ventana del Front-end está abierta, le enviamos los resultados actualizados en vivo
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('bg-check-results', results);
  }

  return results;
}

/* =======================================================
   NUEVO: MONITOREO AUTOMÁTICO EN SEGUNDO PLANO (CRON)
======================================================= */
function startBackgroundMonitoring() {
  // Ajusta el tiempo aquí: 
  // 5 minutos = 5 * 60 * 1000 = 300000 ms
  // 10 minutos = 10 * 60 * 1000 = 600000 ms
  const INTERVALO_TIEMPO = 5 * 60 * 1000;

  console.log(`⏱️ Temporizador configurado cada ${INTERVALO_TIEMPO / 60000} minutos.`);

  setInterval(async () => {
    try {
      const filePath = path.join(__dirname, 'sitios.json');
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        const sites = JSON.parse(data);

        if (sites && sites.length > 0) {
          await checkSites(sites, true); // true activa el envío de correo periódico
        }
      }
    } catch (error) {
      console.error('❌ Error en el monitoreo en segundo plano:', error.message);
    }
  }, INTERVALO_TIEMPO);
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
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log('🖥️ RENDERER LOG:', message);
  });

  if (app.isPackaged) {
    setupAutoUpdater();
  }
}

/* =========================
   IPC HANDLERS
========================= */
ipcMain.handle('check-sites', async (event, sites) => {
  return await checkSites(sites, false); // false = primera verificación / manual
});

ipcMain.handle('check-status', async (event, site) => {
  return await checkStatus(site.url, site.name);
});

ipcMain.handle('show-notification', (event, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
});

ipcMain.handle('report-results', async (event, results) => {
  if (!results || !Array.isArray(results)) return;
  const downSites = results.filter(s => s.status === 'inactive');
  if (downSites.length > 0) {
    await sendAlertEmail(downSites);
  }
});

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('load-sites-file', async () => {
  try {
    const filePath = path.join(__dirname, 'sitios.json');
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '[]', 'utf8');
    }
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle('edit-sites-file', async () => {
  const { shell } = require('electron');
  const filePath = path.join(__dirname, 'sitios.json');
  shell.openPath(filePath);
});

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
});

/* =========================
   AUTO UPDATER
========================= */
function setupAutoUpdater() {
  autoUpdater.checkForUpdatesAndNotify();
}

/* =========================
   APP LIFE CYCLE
========================= */
app.whenReady().then(() => {
  createWindow();

  // 🔥 Arrancar el monitoreo automático en cuanto la app esté lista
  startBackgroundMonitoring();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});