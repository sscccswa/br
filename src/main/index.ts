import { app, BrowserWindow, ipcMain, dialog, session } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { autoUpdater } from 'electron-updater'
import { setupIpcHandlers } from './ipc-handlers'

const isDev = !app.isPackaged

// Security: Disable navigation to external URLs
app.on('web-contents-created', (_, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl)
    // Only allow navigation to our own pages
    if (parsedUrl.origin !== 'http://localhost:5173' && !navigationUrl.startsWith('file://')) {
      event.preventDefault()
    }
  })

  // Prevent new window creation
  contents.setWindowOpenHandler(() => {
    return { action: 'deny' }
  })
})

// Configure auto-updater
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true
autoUpdater.allowPrerelease = true

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#09090b',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#09090b',
      symbolColor: '#71717a',
      height: 36,
    },
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // Custom title bar for Windows
  if (process.platform === 'win32') {
    mainWindow.setMenuBarVisibility(false)
  }

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

app.whenReady().then(() => {
  createWindow()
  setupIpcHandlers(mainWindow!)

  // Automatic update checks disabled - use manual check button instead
  // if (!isDev) {
  //   autoUpdater.checkForUpdates().catch(() => {})
  //
  //   // Check for updates every 30 minutes
  //   setInterval(() => {
  //     autoUpdater.checkForUpdates().catch(() => {})
  //   }, 30 * 60 * 1000)
  // }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// Auto-updater events
autoUpdater.on('checking-for-update', () => {
  mainWindow?.webContents.send('update:status', { status: 'checking' })
})

autoUpdater.on('update-available', (info) => {
  mainWindow?.webContents.send('update:status', { status: 'available', version: info.version })
})

autoUpdater.on('update-not-available', () => {
  mainWindow?.webContents.send('update:status', { status: 'up-to-date' })
})

autoUpdater.on('download-progress', (progress) => {
  mainWindow?.webContents.send('update:status', { status: 'downloading', percent: progress.percent })
})

autoUpdater.on('update-downloaded', (info) => {
  mainWindow?.webContents.send('update:status', { status: 'ready', version: info.version })
})

autoUpdater.on('error', () => {
  mainWindow?.webContents.send('update:status', { status: 'error' })
})

// IPC handlers for updates
ipcMain.handle('update:check', async () => {
  if (isDev) return { status: 'dev' }
  try {
    const result = await autoUpdater.checkForUpdates()
    return { status: 'ok', version: result?.updateInfo?.version }
  } catch {
    return { status: 'error' }
  }
})

ipcMain.handle('update:download', async () => {
  try {
    await autoUpdater.downloadUpdate()
    return { status: 'ok' }
  } catch {
    return { status: 'error' }
  }
})

ipcMain.handle('update:install', () => {
  autoUpdater.quitAndInstall()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Handle file open from OS
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (mainWindow) {
    mainWindow.webContents.send('file:open-external', filePath)
  }
})
