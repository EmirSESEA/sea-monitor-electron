const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {

  // =========================
  // MONITOREO
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
    ipcRenderer.invoke(
      'show-notification',
      { title, body }
    ),

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
  onUpdateStatus: (callback) =>
    ipcRenderer.on(
      'update-status',
      (_event, data) => callback(data)
    ),

  installUpdate: () =>
    ipcRenderer.invoke('install-update'),

  removeUpdateListeners: () =>
    ipcRenderer.removeAllListeners(
      'update-status'
    )
});