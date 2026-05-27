require('dotenv').config();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // Bypass self-signed SSL errors on municipal/gov websites

const { app, BrowserWindow, ipcMain, dialog, Notification, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const nodemailer = require('nodemailer');

const log = require('electron-log');
const { autoUpdater } = require('electron-updater');

// Configure electron-log
log.transports.file.level = 'info';
log.transports.console.level = 'debug';
autoUpdater.logger = log;
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

let mainWindow;

async function sendAlertEmail(downSites) {

  try {

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

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
            <td>${site.name}</td>
            <td>${site.url}</td>
            <td>${site.error}</td>
          </tr>
        `).join('')}

      </table>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: '⚠️ Sitios caídos detectados',
      html
    });

    console.log('Correo de alerta enviado');

  } catch (error) {

    console.error('Error enviando correo:');
    console.error(error);

  }
}

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
    titleBarStyle: 'default', // standard window controls
    backgroundColor: '#0f172a', // Tailwind slate-900 color for smooth load
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Open the DevTools.
  // mainWindow.webContents.openDevTools();

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Check for updates only when the app is packaged (not in dev mode)
    if (app.isPackaged) {
      setupAutoUpdater();
    }
  });
}

function setupAutoUpdater() {
  autoUpdater.on('checking-for-update', () => {
    log.info('Verificando actualizaciones...');
    mainWindow.webContents.send('update-status', { status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    log.info('Actualización disponible:', info.version);
    mainWindow.webContents.send('update-status', { status: 'available', version: info.version });
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('No hay actualizaciones disponibles.');
    mainWindow.webContents.send('update-status', { status: 'not-available', version: info.version });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    log.info(`Descargando: ${progressObj.percent.toFixed(1)}%`);
    mainWindow.webContents.send('update-status', { status: 'downloading', percent: progressObj.percent });
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Actualización descargada:', info.version);
    mainWindow.webContents.send('update-status', { status: 'downloaded', version: info.version });
  });

  autoUpdater.on('error', (err) => {
    log.error('Error en el actualizador:', err);
    mainWindow.webContents.send('update-status', { status: 'error', message: err.message });
  });

  autoUpdater.checkForUpdatesAndNotify();
}

// Helper to determine if a string is a valid URL or domain
function isValidUrlString(str) {
  if (typeof str !== 'string') return false;
  const trimmed = str.trim();
  if (trimmed.includes(' ') || trimmed.includes('@')) return false;

  // Exclude static files and common header keywords
  const lower = trimmed.toLowerCase();
  if (
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.gif') ||
    lower.endsWith('.pdf') ||
    lower.endsWith('.css') ||
    lower.endsWith('.js') ||
    lower.endsWith('.zip')
  ) {
    return false;
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return true;
  }

  // Simple domain matching, e.g. domain.com, sub.domain.org, domain.co/path
  const domainRegex = /^[a-zA-Z0-9][-a-zA-Z0-9._]*\.[a-zA-Z]{2,}(\/.*)?$/;
  return domainRegex.test(trimmed);
}

// Parses excel file and extracts URLs
function parseExcelForUrls(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error('El archivo no existe.');
  }

  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Read worksheet as a 2D array
  const data = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  const urls = [];

  // We will scan each cell to find valid URLs
  data.forEach((row) => {
    if (!Array.isArray(row)) return;
    row.forEach((cell, colIndex) => {
      let cellStr = String(cell).trim();
      if (isValidUrlString(cellStr)) {
        let url = cellStr;
        // Prepend https:// if protocol is missing
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }

        // Try to find a name for this site in the same row
        let name = '';

        // Strategy 1: Look for other cells in the same row that are strings, not URLs, and not empty
        for (let i = 0; i < row.length; i++) {
          if (i !== colIndex) {
            const possibleName = String(row[i]).trim();
            if (possibleName.length > 0 && !isValidUrlString(possibleName) && isNaN(Number(possibleName))) {
              name = possibleName;
              break;
            }
          }
        }

        // Strategy 2: If no name found, use the domain name as name
        if (!name) {
          try {
            name = new URL(url).hostname;
          } catch (e) {
            name = url;
          }
        }

        urls.push({ url, name });
      }
    });
  });

  // Deduplicate URLs
  const seen = new Set();
  return urls.filter(item => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

// IPC Handlers
ipcMain.handle('select-excel-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Seleccionar archivo de Excel',
    properties: ['openFile'],
    filters: [
      { name: 'Archivos de Excel y CSV', extensions: ['xlsx', 'xls', 'csv', 'ods'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  try {
    const sites = parseExcelForUrls(filePath);
    return { filePath: path.basename(filePath), fullPath: filePath, sites };
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle('parse-excel-file', async (event, filePath) => {
  try {
    const sites = parseExcelForUrls(filePath);
    return { filePath: path.basename(filePath), fullPath: filePath, sites };
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle('check-status', async (event, url) => {
  const controller = new AbortController();
  // 12-second timeout to give slower pages a chance but not hang forever
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  const startTime = Date.now();
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    const duration = Date.now() - startTime;
    clearTimeout(timeoutId);

    // Status is active if HTTP status code is in 2xx or 3xx range
    const isActive = response.status >= 200 && response.status < 400;

    return {
      status: isActive ? 'active' : 'inactive',
      statusCode: response.status,
      statusText: response.statusText || `HTTP ${response.status}`,
      responseTime: duration,
      error: isActive ? null : `Error HTTP: ${response.status}`
    };
  } catch (error) {
    clearTimeout(timeoutId);
    const duration = Date.now() - startTime;
    let errorMessage = error.message;

    if (error.name === 'AbortError') {
      errorMessage = 'Tiempo de espera agotado (12s)';
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = 'Dominio no encontrado (DNS)';
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Conexión rechazada por el servidor';
    }

    return {
      status: 'inactive',
      statusCode: 0,
      statusText: 'Error',
      responseTime: duration,
      error: errorMessage
    };
  }
});

ipcMain.handle('show-notification', (event, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({
      title,
      body,
      silent: false
    }).show();
  }
});

ipcMain.handle('load-sites-file', async () => {
  try {
    const filePath = path.join(__dirname, 'sitios.json');
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '[]', 'utf8');
      return [];
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle('edit-sites-file', async () => {
  const filePath = path.join(__dirname, 'sitios.json');
  if (fs.existsSync(filePath)) {
    shell.openPath(filePath);
    return true;
  }
  return false;
});

// IPC: Manual update check
ipcMain.handle('check-for-updates', async () => {
  if (!app.isPackaged) {
    return { status: 'dev-mode', message: 'Las actualizaciones solo están disponibles en la versión instalada.' };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    return { status: 'ok', version: result?.updateInfo?.version };
  } catch (err) {
    return { status: 'error', message: err.message };
  }
});

// IPC: Install downloaded update
ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
});

// IPC: Get app version
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// App Lifecycle
app.whenReady().then(() => {

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
