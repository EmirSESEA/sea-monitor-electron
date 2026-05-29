const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', { // 👈 Aseguramos que se llame 'api'

  // =========================
  // ESCUCHADORES DESDE EL MAIN
  // =========================
  onBackgroundUpdate: (callback) =>
    ipcRenderer.on('bg-check-results', (_event, value) => callback(value)),

  onUpdateStatus: (callback) =>
    ipcRenderer.on('update-status', (_event, data) => callback(data)),

  onMainLog: (callback) =>
    ipcRenderer.on('main-log', (_event, data) => callback(data)),

  // =========================
  // MONITOREO (INVOKES)
  // =========================
  checkSites: (sites) =>
    ipcRenderer.invoke('check-sites', sites),

  checkStatus: (site) =>
    ipcRenderer.invoke('check-status', site),

  loadSitesFile: () =>
    ipcRenderer.invoke('load-sites-file'),

  // =========================
  // NOTIFICACIONES
  // =========================
  showNotification: (title, body) =>
    ipcRenderer.invoke('show-notification', { title, body }),

  reportResults: (results) =>
    ipcRenderer.invoke('report-results', results),

  // =========================
  // APP
  // =========================
  getAppVersion: () =>
    ipcRenderer.invoke('get-app-version'),

  editSitesFile: () =>
    ipcRenderer.invoke('edit-sites-file'),

  // =========================
  // AUTO UPDATER
  // =========================
  installUpdate: () =>
    ipcRenderer.invoke('install-update'),

  removeUpdateListeners: () =>
    ipcRenderer.removeAllListeners('update-status')
});