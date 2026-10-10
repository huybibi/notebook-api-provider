'use strict';

/**
 * main.js — Điểm vào của Electron: tạo cửa sổ, dựng store, cổng nội bộ, lịch đo tự động.
 */

const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const { Store } = require('./store');
const { Gateway } = require('./gateway');
const scoring = require('./scoring');
const { registerIpc } = require('./ipc');

const isDev = process.argv.includes('--dev');

let win = null;
let store = null;
let gateway = null;
let probeTimer = null;
let registered = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

function dataFile() {
  const dir = app.getPath('userData');
  return path.join(dir, 'notebook.json');
}

function createWindow() {
  win = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1080,
    minHeight: 680,
    backgroundColor: '#0b0a14',
    title: 'Notebook API Provider',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.ico'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('closed', () => {
    win = null;
  });

  if (isDev) win.webContents.openDevTools({ mode: 'detach' });
}

function buildMenu() {
  const template = [
    {
      label: 'Notebook',
      submenu: [
        {
          label: 'Mở thư mục dữ liệu',
          click: () => shell.openPath(path.dirname(store.filePath)),
        },
        {
          label: 'Đo lại tất cả nhà cung cấp',
          click: () => {
            if (win) win.webContents.send('menu:probeAll');
          },
        },
        { type: 'separator' },
        { role: 'quit', label: 'Thoát' },
      ],
    },
    {
      label: 'Xem',
      submenu: [
        { role: 'reload', label: 'Tải lại' },
        { role: 'forceReload', label: 'Tải lại hoàn toàn' },
        { role: 'toggleDevTools', label: 'Công cụ nhà phát triển' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Cỡ chữ gốc' },
        { role: 'zoomIn', label: 'Phóng to' },
        { role: 'zoomOut', label: 'Thu nhỏ' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Toàn màn hình' },
      ],
    },
    {
      label: 'Sửa',
      submenu: [
        { role: 'undo', label: 'Hoàn tác' },
        { role: 'redo', label: 'Làm lại' },
        { type: 'separator' },
        { role: 'cut', label: 'Cắt' },
        { role: 'copy', label: 'Sao chép' },
        { role: 'paste', label: 'Dán' },
        { role: 'selectAll', label: 'Chọn tất cả' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function scheduleProbe() {
  if (probeTimer) {
    clearInterval(probeTimer);
    probeTimer = null;
  }
  const cfg = store.settings.probe;
  if (cfg.autoEnabled === false) return;
  const minutes = Math.max(5, Number(cfg.intervalMinutes) || 60);
  probeTimer = setInterval(() => {
    if (win && !win.isDestroyed()) win.webContents.send('menu:probeAll');
  }, minutes * 60000);
}

async function boot() {
  store = new Store(dataFile());

  // Nếu file dữ liệu chưa tồn tại, ghi ngay bản mặc định để người dùng thấy đường dẫn.
  if (!fs.existsSync(store.filePath)) {
    store.load();
    store.save(true);
  } else {
    store.load();
  }

  gateway = new Gateway(store, {
    computeScores: scoring.computeScores,
    rankCandidates: scoring.rankCandidates,
    pickKey: scoring.pickKey,
  });

  registered = registerIpc({
    ipcMain,
    dialog,
    shell,
    store,
    gateway,
    getWindow: () => win,
  });

  createWindow();
  buildMenu();
  scheduleProbe();

  win.webContents.once('did-finish-load', async () => {
    const scores = scoring.computeScores(store);
    scoring.computeAlerts(store, scores);
    store.save(false);

    if (store.settings.gateway.enabled) {
      try {
        await gateway.start();
      } catch (err) {
        store.addAlert({ level: 'error', code: 'gateway_boot', message: 'Không mở được cổng nội bộ: ' + err.message });
      }
    }
    if (store.settings.probe.probeOnStartup && store.data.providers.length) {
      setTimeout(() => {
        if (win && !win.isDestroyed()) win.webContents.send('menu:probeAll');
      }, 4000);
    }
  });
}

app.whenReady().then(boot);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', async () => {
  if (probeTimer) clearInterval(probeTimer);
  try {
    if (gateway) await gateway.stop();
  } catch (_) {
    /* ignore */
  }
  try {
    if (store) store.save(true);
  } catch (_) {
    /* ignore */
  }
});

process.on('uncaughtException', (err) => {
  try {
    if (store) {
      store.addAlert({ level: 'error', code: 'uncaught', message: String(err && err.message) });
      store.save(true);
    }
  } catch (_) {
    /* ignore */
  }
  // eslint-disable-next-line no-console
  console.error('[notebook] uncaughtException:', err);
});
