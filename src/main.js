require('dotenv').config();

// ⚠️ solo en desarrollo (más seguro)
if (!require('electron').app?.isPackaged) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const { app, BrowserWindow, ipcMain, dialog, Notification, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

const log = require('electron-log');
const { autoUpdater } = require('electron-updater');

log.transports.file.level = 'info';
log.transports.console.level = 'debug';
autoUpdater.logger = log;
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

let mainWindow;

/* =========================
   EMAIL CONFIG (REUTILIZABLE)
========================= */
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/* =========================
   ENVIAR ALERTA
========================= */
async function sendAlertEmail(downSites) {
  try {
    if (!downSites || downSites.length === 0) return;

    const html = `
      <h2>⚠️ Sitios caídos detectados</h2>

      <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width:100%;">
        <tr>
          <th>Sitio</th>
          <th>URL</th>
          <th>Error</th>
        </tr>

        ${downSites.map(site => `
          <tr>
            <td>${site.name || ''}</td>
            <td>${site.url}</td>
            <td>${site.error || 'Sin detalle'}</td>
          </tr>
        `).join('')}
      </table>
    `;

    await transporter.sendMail({
      from: `"Monitor de URLs" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: '⚠️ Sitios caídos detectados',
      html
    });

    console.log('📩 Correo de alerta enviado');
  } catch (error) {
    console.error('❌ Error enviando correo:', error);
  }
}

/* =========================
   EJEMPLO: CHECK DE SITIO
========================= */
async function checkStatus(url, name = '') {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Cache-Control': 'no-cache'
      }
    });

    clearTimeout(timeoutId);

    const ok = response.status >= 200 && response.status < 400;

    return {
      name,
      url,
      status: ok ? 'active' : 'inactive',
      statusCode: response.status,
      responseTime: Date.now() - startTime,
      error: ok ? null : `HTTP ${response.status}`
    };

  } catch (err) {
    clearTimeout(timeoutId);

    return {
      name,
      url,
      status: 'inactive',
      statusCode: 0,
      responseTime: Date.now() - startTime,
      error: err.message
    };
  }
}

/* =========================
   EJEMPLO: MONITOREO EN LOTE
   (aquí es donde llamas el email)
========================= */
async function checkSites(sites) {
  const results = await Promise.all(
    sites.map(site => checkStatus(site.url, site.name))
  );

  const downSites = results.filter(s => s.status === 'inactive');

  if (downSites.length > 0) {
    await sendAlertEmail(downSites);
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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    backgroundColor: '#0f172a',
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (app.isPackaged) setupAutoUpdater();
  });
}

/* =========================
   IPC SIMPLE (SIN XLSX)
========================= */
ipcMain.handle('check-sites', async (event, sites) => {
  return await checkSites(sites);
});

ipcMain.handle('show-notification', (event, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
});
/* =========================
   Handler faltante
========================= */
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

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

/* =========================
   AUTO UPDATER
========================= */
function setupAutoUpdater() {
  autoUpdater.on('checking-for-update', () => {
    mainWindow.webContents.send('update-status', { status: 'checking' });
  });

  autoUpdater.on('update-available', info => {
    mainWindow.webContents.send('update-status', { status: 'available', version: info.version });
  });

  autoUpdater.on('update-not-available', info => {
    mainWindow.webContents.send('update-status', { status: 'not-available', version: info.version });
  });

  autoUpdater.on('download-progress', progress => {
    mainWindow.webContents.send('update-status', {
      status: 'downloading',
      percent: progress.percent
    });
  });

  autoUpdater.on('update-downloaded', info => {
    mainWindow.webContents.send('update-status', {
      status: 'downloaded',
      version: info.version
    });
  });

  autoUpdater.checkForUpdatesAndNotify();
}

/* =========================
   APP LIFECYCLE
========================= */
app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});