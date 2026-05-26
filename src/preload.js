const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Excel / Sites
  selectExcelFile: () => ipcRenderer.invoke('select-excel-file'),
  parseExcelFile: (filePath) => ipcRenderer.invoke('parse-excel-file', filePath),
  checkStatus: (url) => ipcRenderer.invoke('check-status', url),
  showNotification: (title, body) => ipcRenderer.invoke('show-notification', { title, body }),
  loadSitesFile: () => ipcRenderer.invoke('load-sites-file'),
  editSitesFile: () => ipcRenderer.invoke('edit-sites-file'),

  // Auto-updater
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_event, data) => callback(data)),
  removeUpdateListeners: () => ipcRenderer.removeAllListeners('update-status')
});
