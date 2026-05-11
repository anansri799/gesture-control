// main.js — Electron main process
// Responsibilities: window management, tray, IPC routing, app lifecycle

const { app, BrowserWindow, Tray, Menu, screen, ipcMain } = require('electron')
const path = require('path')

let overlayWindow = null
let tray = null

/**
 * Creates a fullscreen transparent overlay window.
 * The overlay renders the hand skeleton HUD on top of all other apps.
 * setIgnoreMouseEvents ensures the window never intercepts user input.
 */
function createOverlay() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  overlayWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
  contextIsolation: true,
  nodeIntegration: false,
  preload: path.join(__dirname, 'src', 'preload.js'),
}
  })

  overlayWindow.setIgnoreMouseEvents(true)
  overlayWindow.loadFile('overlay.html')
  overlayWindow.webContents.openDevTools({ mode: 'detach' })
  overlayWindow.webContents.on('did-finish-load', () => console.log('overlay loaded'))
}

/**
 * Initialises the system tray icon.
 * This is the only UI control surface — no dock icon, no window chrome.
 */
function createTray() {
  tray = new Tray(path.join(__dirname, 'assets', 'icon.png'))

  const menu = Menu.buildFromTemplate([
    { label: 'GestureControl', enabled: false },
    { type: 'separator' },
    { label: 'Pause',  click: () => ipcMain.emit('pause-gestures')  },
    { label: 'Resume', click: () => ipcMain.emit('resume-gestures') },
    { type: 'separator' },
    { label: 'Quit',   click: () => app.quit() }
  ])

  tray.setToolTip('GestureControl — Active')
  tray.setContextMenu(menu)
}

app.whenReady().then(() => {
  createOverlay()
  createTray()

  const { inject } = require('./src/injector')

  ipcMain.on('gesture', async (_event, data) => {
    await inject(data)
  })
})

// Signal the renderer to release the camera before the process exits
app.on('before-quit', () => {
  overlayWindow?.webContents.send('stop-camera')
})

// Keep the process alive on macOS when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})