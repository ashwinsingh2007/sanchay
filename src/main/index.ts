import { existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, nativeTheme, session, shell } from 'electron'
import { openDatabase } from './db/client'
import { registerIpc } from './ipc'
import { cleanupDuplicates } from './duplicates'
import { refreshCommitments } from './analysis'
import { reapplyCategories } from './repository'
import { ensureBuiltinSources } from './mcp/sources'
import { showSplash } from './splash'

const isDev = !app.isPackaged && !!process.env['ELECTRON_RENDERER_URL']

/**
 * Privacy guard: the renderer may only load the bundled app (or the local Vite dev server).
 * Any other network request is cancelled, so financial data cannot leave the machine through
 * the UI even by accident.
 */
function lockDownNetwork(): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  const devOrigin = devUrl ? new URL(devUrl).origin : null
  const devWsOrigin = devOrigin ? devOrigin.replace(/^http/, 'ws') : null

  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url
    const allowed =
      url.startsWith('file://') ||
      url.startsWith('devtools://') ||
      url.startsWith('data:') ||
      url.startsWith('blob:') ||
      (isDev &&
        !!devOrigin &&
        (url.startsWith(devOrigin) || (!!devWsOrigin && url.startsWith(devWsOrigin))))
    callback({ cancel: !allowed })
  })
  // Only the microphone (for chat dictation), and only for the app's own page.
  const ownPage = (url: string): boolean =>
    url.startsWith('file://') || (isDev && !!devOrigin && url.startsWith(devOrigin))
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    const audioOnly =
      permission === 'media' &&
      'mediaTypes' in details &&
      (details.mediaTypes ?? []).every((t) => t === 'audio')
    callback(audioOnly && ownPage(wc.getURL()))
  })
  session.defaultSession.setPermissionCheckHandler(
    (_wc, permission, origin) => permission === 'media' && ownPage(origin)
  )
}

// The app was called "Personal AI CFO" before it became Sanchay. Its data folder (database,
// window state, preferences) moves to the new name once, before Chromium opens it.
// SANCHAY_DATA_DIR points a copy of the app at another folder, e.g. to try the sample data.
app.setName('Sanchay')
{
  const override = process.env['SANCHAY_DATA_DIR']
  const current = override || join(app.getPath('appData'), 'Sanchay')
  const legacy = join(app.getPath('appData'), 'Personal AI CFO')
  if (!override && !existsSync(current) && existsSync(legacy)) {
    try {
      renameSync(legacy, current)
    } catch (err) {
      console.error('[startup] could not move the old data folder', err)
    }
  }
  app.setPath('userData', current)
}

function createWindow(onReady?: (win: BrowserWindow) => void): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    title: 'Sanchay',
    backgroundColor: '#f3f5f8',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  })

  win.once('ready-to-show', () => (onReady ? onReady(win) : win.show()))

  // Never open new windows inside the app; only allow explicit https links in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (!(devUrl && url.startsWith(devUrl)) && !url.startsWith('file://')) event.preventDefault()
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

app.whenReady().then(() => {
  // Packaged builds carry resources/icon.icns; in development the dock would show Electron's.
  if (process.platform === 'darwin' && !app.isPackaged)
    app.dock?.setIcon(join(app.getAppPath(), 'resources/icon.png'))
  const revealMain = showSplash()
  nativeTheme.themeSource = 'system'
  const dataDirectory = app.getPath('userData')
  const databaseFile = join(dataDirectory, 'personal-cfo.sqlite')
  const { db } = openDatabase(databaseFile)
  // Heal any duplicates left by earlier imports (same statement imported twice, overlaps).
  try {
    if (cleanupDuplicates(db) > 0) refreshCommitments(db)
  } catch (err) {
    console.error('[startup] duplicate clean-up failed', err)
  }
  // Re-file older imports with the latest categorisation rules.
  try {
    if (reapplyCategories(db) > 0) refreshCommitments(db)
  } catch (err) {
    console.error('[startup] re-categorisation failed', err)
  }

  lockDownNetwork()
  ensureBuiltinSources(db)
  registerIpc(db, { dataDirectory, databaseFile })
  createWindow(revealMain)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
