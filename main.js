const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// GPU & rendering optimizations
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-features', 'ElasticOverscroll');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: path.join(__dirname, 'icon-256.png'),
    backgroundColor: '#1e1e1e',
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#2b2b2b',
      symbolColor: '#999',
      height: 36,
    },
    webPreferences: {
      webviewTag: true,
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  win.loadFile('index.html');
  win.setMenuBarVisibility(false);

  // Show maximized
  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });

  // Intercept Ctrl+Tab globally (works even when webview has focus)
  win.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.key === 'Tab') {
      win.webContents.send('switch-tab', input.shift);
      event.preventDefault();
    }
  });

  // Also intercept from webview contents
  win.webContents.on('did-attach-webview', (_, webviewContents) => {
    webviewContents.on('before-input-event', (event, input) => {
      if (input.control && input.key === 'Tab') {
        win.webContents.send('switch-tab', input.shift);
        event.preventDefault();
      }
    });

    webviewContents.on('context-menu', (_, params) => {
      win.webContents.send('show-context-menu', {
        x: params.x,
        y: params.y,
        wcId: webviewContents.id,
      });
    });
  });
}

// Memory usage query — WMI WorkingSetPrivate matches Task Manager exactly
ipcMain.handle('get-memory', () => {
  const { execFile } = require('child_process');
  return new Promise(resolve => {
    execFile('powershell', [
      '-NoProfile', '-Command',
      "(gcim Win32_PerfFormattedData_PerfProc_Process -Filter \"Name LIKE 'AIHub%'\" | Measure-Object WorkingSetPrivate -Sum).Sum / 1KB"
    ], { timeout: 5000 }, (err, stdout) => {
      const val = parseFloat((stdout || '').trim());
      if (!err && val > 0) {
        resolve(Math.round(val));
      } else {
        // Fallback to Electron API
        let kb = 0;
        app.getAppMetrics().forEach(m => { kb += m.memory.workingSetSize; });
        resolve(kb);
      }
    });
  });
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => app.quit());
