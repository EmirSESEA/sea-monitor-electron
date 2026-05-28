// STATE VARIABLES
let sites = [];
let monitoringActive = false;
let monitoringIntervalId = null;
let currentFilter = 'all';
let searchQuery = '';

// DOM ELEMENTS
const btnEditSites = document.getElementById('btn-edit-sites');
const btnReloadSites = document.getElementById('btn-reload-sites');

const metricAll = document.getElementById('metric-all');
const metricActive = document.getElementById('metric-active');
const metricInactive = document.getElementById('metric-inactive');
const metricPending = document.getElementById('metric-pending');

const valAll = document.getElementById('val-all');
const valActive = document.getElementById('val-active');
const valInactive = document.getElementById('val-inactive');
const valPending = document.getElementById('val-pending');

const checkIntervalSelect = document.getElementById('check-interval');
const btnStartMonitor = document.getElementById('btn-start-monitor');
const btnStopMonitor = document.getElementById('btn-stop-monitor');
const btnCheckNow = document.getElementById('btn-check-now');

const searchInput = document.getElementById('search-input');
const monitorGlobalStatus = document.getElementById('monitor-global-status');
const globalPulse = document.getElementById('global-pulse');

const emptyState = document.getElementById('empty-state');
const sitesGrid = document.getElementById('sites-grid');

const logPanel = document.getElementById('log-panel');
const logHeaderToggle = document.getElementById('log-header-toggle');
const logContent = document.getElementById('log-content');
const btnClearLogs = document.getElementById('btn-clear-logs');
const btnToggleLog = document.getElementById('btn-toggle-log');

// INITIALIZATION
window.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  addLog('Sistema StatusPulse iniciado y listo.', 'info');
  loadSitesFromConfig(); // Auto-load predefined sites list on startup
});

// LOGS MANAGEMENT
function addLog(message, type = 'info') {
  // Clear empty message if present
  const emptyMsg = logContent.querySelector('.log-empty-msg');
  if (emptyMsg) {
    emptyMsg.remove();
  }

  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const timestamp = `[${hours}:${minutes}:${seconds}]`;

  const logItem = document.createElement('div');
  logItem.className = `log-item ${type}`;

  const timeSpan = document.createElement('span');
  timeSpan.className = 'log-time';
  timeSpan.textContent = timestamp;

  const msgSpan = document.createElement('span');
  msgSpan.className = 'log-msg';
  msgSpan.textContent = message;

  logItem.appendChild(timeSpan);
  logItem.appendChild(msgSpan);
  logContent.appendChild(logItem);

  // Auto scroll to bottom
  logContent.scrollTop = logContent.scrollHeight;

  // Limit log count to 150 items to prevent performance lag
  while (logContent.children.length > 150) {
    logContent.removeChild(logContent.firstChild);
  }
}

// EVENT LISTENERS SETUP
function setupEventListeners() {
  // Config Actions
  btnEditSites.addEventListener('click', () => {
    addLog('Abriendo archivo sitios.json para edición...', 'info');
    window.api.editSitesFile();
  });

  btnReloadSites.addEventListener('click', () => {
    loadSitesFromConfig();
  });

  // Monitoring Controls
  btnStartMonitor.addEventListener('click', startMonitoring);
  btnStopMonitor.addEventListener('click', stopMonitoring);
  btnCheckNow.addEventListener('click', () => checkAllSites());

  // Search & Filter
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderGrid();
  });

  [metricAll, metricActive, metricInactive, metricPending].forEach(card => {
    card.addEventListener('click', () => {
      document.querySelector('.metric-card.active').classList.remove('active');
      card.classList.add('active');
      currentFilter = card.dataset.filter;
      renderGrid();
    });
  });

  // Log Panel Collapsing
  logHeaderToggle.addEventListener('click', (e) => {
    if (e.target.closest('#btn-clear-logs')) return;
    logPanel.classList.toggle('collapsed');
  });

  btnClearLogs.addEventListener('click', () => {
    logContent.innerHTML = '';
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'log-empty-msg';
    emptyMsg.textContent = 'Historial limpio. Inicia el monitoreo para registrar actividad.';
    logContent.appendChild(emptyMsg);
  });
}

// LOAD LIST FROM LOCAL JSON CONFIG FILE
async function loadSitesFromConfig() {
  // Stop monitoring first if it was active to avoid collisions
  const wasMonitoring = monitoringActive;
  if (monitoringActive) {
    stopMonitoring();
  }

  addLog('Cargando lista de sitios desde sitios.json...', 'info');
  const result = await window.api.loadSitesFile();

  if (result.error) {
    addLog(`Error al leer archivo sitios.json: ${result.error}`, 'warn');
    return;
  }

  if (!Array.isArray(result) || result.length === 0) {
    addLog('La lista de sitios está vacía o el archivo sitios.json está mal formateado.', 'warn');
    emptyState.classList.remove('hidden');
    sitesGrid.classList.add('hidden');

    // Disable controls
    btnStartMonitor.setAttribute('disabled', 'true');
    btnCheckNow.setAttribute('disabled', 'true');
    searchInput.setAttribute('disabled', 'true');
    return;
  }

  // Load sites into state
  loadSites(result);
  addLog(`Se cargaron ${result.length} sitios web correctamente.`, 'success');

  // Resume monitoring if it was active
  if (wasMonitoring) {
    startMonitoring();
  }
}

// LOAD SITES INTO RUNTIME STATE
function loadSites(newSites) {
  sites = newSites.map(s => ({
    name: s.name || s.url,
    url: s.url,
    status: 'pending',
    statusCode: null,
    statusText: 'Sin verificar',
    responseTime: null,
    error: null,
    lastChecked: null
  }));

  // Enable controls
  btnStartMonitor.removeAttribute('disabled');
  btnCheckNow.removeAttribute('disabled');
  searchInput.removeAttribute('disabled');

  // Hide empty state, show grid
  emptyState.classList.add('hidden');
  sitesGrid.classList.remove('hidden');

  // Initial UI Render
  updateMetrics();
  renderGrid();

  // Update status bar
  monitorGlobalStatus.textContent = 'Monitoreo listo';
  globalPulse.className = 'status-pulse-dot stopped';

  // Automatically check all sites once loaded
  checkAllSites();
}

// RENDER GRID CARDS
function renderGrid() {
  sitesGrid.innerHTML = '';

  // Filter sites
  const filteredSites = sites.filter(site => {
    // Filter by search query
    const matchesSearch = site.name.toLowerCase().includes(searchQuery) ||
      site.url.toLowerCase().includes(searchQuery);

    if (!matchesSearch) return false;

    // Filter by metric state
    if (currentFilter === 'all') return true;
    return site.status === currentFilter;
  });

  if (filteredSites.length === 0) {
    const noResults = document.createElement('div');
    noResults.className = 'empty-state';
    noResults.style.gridColumn = '1 / -1';
    noResults.style.padding = '3rem';
    noResults.innerHTML = `
      <h3>No hay resultados</h3>
      <p>No se encontraron sitios que coincidan con los filtros seleccionados.</p>
    `;
    sitesGrid.appendChild(noResults);
    return;
  }

  // Create card DOM elements
  filteredSites.forEach((site) => {
    // Find index of this site in the original master array
    const masterIndex = sites.findIndex(s => s.url === site.url);

    const card = document.createElement('div');
    card.className = `site-card ${site.status}-state`;

    // Inner card HTML
    card.innerHTML = `
      <div class="card-header">
        <div class="site-info">
          <span class="site-name" title="${site.name}">${site.name}</span>
          <span class="site-url" title="${site.url}"><a href="${site.url}" target="_blank">${site.url}</a></span>
        </div>
        <div class="card-status-indicator">
          <div class="status-dot" title="${site.status}"></div>
        </div>
      </div>

      <div class="card-details">
        <span class="status-badge">${site.statusText}</span>
        <div class="speed-metric">
          <svg class="speed-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
          </svg>
          <span>${site.responseTime !== null ? `${site.responseTime} ms` : '--'}</span>
        </div>
      </div>

      <div class="card-footer">
        <span>Último check: ${site.lastChecked ? site.lastChecked : 'Nunca'}</span>
        <button class="btn-card-test" data-index="${masterIndex}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
          </svg>
          Probar
        </button>
      </div>
    `;

    // Hook card individual "Test Now" button
    const testBtn = card.querySelector('.btn-card-test');
    testBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      testBtn.setAttribute('disabled', 'true');
      const idx = parseInt(testBtn.dataset.index);
      addLog(`Verificando sitio individualmente: ${sites[idx].name}`, 'info');
      await checkSiteStatus(idx);
      testBtn.removeAttribute('disabled');
    });

    sitesGrid.appendChild(card);
  });
}

// UPDATE METRIC BADGE COUNTS
function updateMetrics() {
  const allCount = sites.length;
  const activeCount = sites.filter(s => s.status === 'active').length;
  const inactiveCount = sites.filter(s => s.status === 'inactive').length;
  const pendingCount = sites.filter(s => s.status === 'pending').length;

  valAll.textContent = allCount;
  valActive.textContent = activeCount;
  valInactive.textContent = inactiveCount;
  valPending.textContent = pendingCount;
}

// INDIVIDUAL SITE CHECK LOGIC
async function checkSiteStatus(index) {
  const site = sites[index];
  const oldStatus = site.status;

  // Temporarily set to pending for UI animation
  site.status = 'pending';
  site.statusText = 'Verificando...';

  renderGrid();
  updateMetrics();

  const result = await window.api.checkStatus({
    url: site.url,
    name: site.name
  });

  // Time format
  const now = new Date();
  const timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + ':' + String(now.getSeconds()).padStart(2, '0');

  // Update site info
  site.status = result.status;
  site.statusCode = result.statusCode;
  site.statusText = result.statusText;
  site.responseTime = result.responseTime;
  site.error = result.error;
  site.lastChecked = timeStr;

  // Handle Status transitions & notifications
  if (result.status === 'active') {
    // If it was inactive/pending and now is active
    if (oldStatus === 'inactive') {
      addLog(`Sitio Recuperado: ${site.name} está online de nuevo (HTTP ${result.statusCode} - ${result.responseTime}ms)`, 'success');
      window.api.showNotification(
        '✅ Sitio Web Recuperado',
        `El sitio "${site.name}" vuelve a estar en línea. (${result.statusText} en ${result.responseTime}ms)`
      );
    } else if (oldStatus === 'pending') {
      addLog(`Sitio Online: ${site.name} responde correctamente (HTTP ${result.statusCode} - ${result.responseTime}ms)`, 'success');
    }
  } else {
    // If status is inactive
    if (oldStatus === 'active') {
      // IT WENT DOWN!
      addLog(`SITIO CAÍDO: ${site.name} ha dejado de funcionar! (${result.error || result.statusText})`, 'warn');
      window.api.showNotification(
        '⚠️ Sitio Web Caído',
        `El sitio "${site.name}" (${site.url}) se ha caído. Error: ${result.error || result.statusText}`
      );
    } else if (oldStatus === 'pending') {
      addLog(`Sitio Offline: ${site.name} reporta error (${result.error || result.statusText})`, 'warn');
    }
  }

  // Update grid & metrics
  renderGrid();
  updateMetrics();
}

// MASTER GROUP VERIFICATION LOOP
async function checkAllSites() {
  if (sites.length === 0) return;

  btnCheckNow.setAttribute('disabled', 'true');
  addLog('Iniciando ronda de monitoreo para todos los sitios...', 'info');

  globalPulse.className = 'status-pulse-dot running';
  if (monitoringActive) {
    monitorGlobalStatus.textContent = 'Monitoreando (Actualizando...)';
  } else {
    monitorGlobalStatus.textContent = 'Verificando todos...';
  }

  // Stagger requests to avoid connection bottleneck (120ms intervals)
  const promises = sites.map(async (site, idx) => {
    await new Promise(resolve => setTimeout(resolve, idx * 120));
    await checkSiteStatus(idx);
  });

  await Promise.all(promises);

  addLog('Monitoreo completado para todos los sitios.', 'info');
  btnCheckNow.removeAttribute('disabled');

  // Report results to the main process to trigger email alerts
  const resultsToReport = sites.map(s => ({
    name: s.name,
    url: s.url,
    status: s.status,
    statusCode: s.statusCode,
    responseTime: s.responseTime,
    error: s.error
  }));
  window.api.reportResults(resultsToReport);

  if (monitoringActive) {
    monitorGlobalStatus.textContent = 'Monitoreando';
    globalPulse.className = 'status-pulse-dot running';
  } else {
    monitorGlobalStatus.textContent = 'Monitoreo detenido';
    globalPulse.className = 'status-pulse-dot stopped';
  }
}

// START BACKGROUND AUTOMATIC INTERVAL
function startMonitoring() {
  if (monitoringActive) return;

  monitoringActive = true;
  btnStartMonitor.classList.add('hidden');
  btnStopMonitor.classList.remove('hidden');

  const intervalTime = parseInt(checkIntervalSelect.value);
  addLog(`Monitoreo automático activado (cada ${intervalTime / 1000} segundos)`, 'info');

  // Do a verification run immediately
  checkAllSites();

  // Set periodic execution
  monitoringIntervalId = setInterval(checkAllSites, intervalTime);
}

// STOP BACKGROUND AUTOMATIC INTERVAL
function stopMonitoring() {
  if (!monitoringActive) return;

  monitoringActive = false;
  btnStopMonitor.classList.add('hidden');
  btnStartMonitor.classList.remove('hidden');

  if (monitoringIntervalId) {
    clearInterval(monitoringIntervalId);
    monitoringIntervalId = null;
  }

  globalPulse.className = 'status-pulse-dot stopped';
  monitorGlobalStatus.textContent = 'Monitoreo detenido';
  addLog('Monitoreo automático detenido.', 'info');
}

// ─── AUTO-UPDATER UI ───
(async function initUpdaterUI() {
  // Show current version in sidebar
  try {
    const version = await window.api.getAppVersion();
    const versionEl = document.getElementById('app-version');
    if (versionEl && version) {
      versionEl.textContent = `v${version}`;
    }
  } catch (e) {
    // Dev mode — version may not be available
  }

  const updateBanner = document.getElementById('update-banner');
  const updateMessage = document.getElementById('update-message');
  const updateProgressBar = document.getElementById('update-progress-bar');
  const updateProgressFill = document.getElementById('update-progress-fill');
  const btnInstallUpdate = document.getElementById('btn-install-update');

  if (!updateBanner) return;

  // Listen for update events from main process
  window.api.onUpdateStatus((data) => {
    switch (data.status) {
      case 'checking':
        // Don't show banner for routine checks
        break;

      case 'available':
        updateBanner.classList.remove('hidden');
        updateMessage.textContent = `Actualización v${data.version} disponible — descargando...`;
        updateProgressBar.classList.add('visible');
        btnInstallUpdate.classList.add('hidden');
        addLog(`Actualización v${data.version} encontrada. Descargando...`, 'info');
        break;

      case 'downloading':
        updateBanner.classList.remove('hidden');
        updateProgressBar.classList.add('visible');
        updateProgressFill.style.width = `${data.percent.toFixed(0)}%`;
        updateMessage.textContent = `Descargando actualización... ${data.percent.toFixed(0)}%`;
        break;

      case 'downloaded':
        updateProgressBar.classList.remove('visible');
        btnInstallUpdate.classList.remove('hidden');
        updateMessage.textContent = `Actualización v${data.version} lista para instalar`;
        addLog(`Actualización v${data.version} descargada. Lista para instalar.`, 'info');
        break;

      case 'not-available':
        // Everything up to date — no banner needed
        break;

      case 'error':
        // Only show briefly if we were already showing the banner
        if (!updateBanner.classList.contains('hidden')) {
          updateMessage.textContent = `Error al actualizar: ${data.message}`;
          updateProgressBar.classList.remove('visible');
          setTimeout(() => updateBanner.classList.add('hidden'), 5000);
        }
        break;
    }
  });

  // Install button: quit and install
  if (btnInstallUpdate) {
    btnInstallUpdate.addEventListener('click', () => {
      addLog('Instalando actualización y reiniciando...', 'info');
      window.api.installUpdate();
    });
  }
})();
