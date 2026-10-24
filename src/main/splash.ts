import { BrowserWindow } from 'electron'
import iconSvg from '../../resources/icon.svg?raw'

/**
 * The start-up screen: the Sanchay mark on a small frameless card, shown the moment the app opens
 * and closed once the main window has painted. Self-contained HTML, no scripts.
 */
const MIN_VISIBLE_MS = 1200

function html(): string {
  const logo = `data:image/svg+xml;base64,${Buffer.from(iconSvg).toString('base64')}`
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<style>
  html, body { margin: 0; height: 100%; }
  body {
    display: grid; place-items: center; overflow: hidden; border-radius: 22px;
    background: radial-gradient(120% 90% at 50% 0%, #14876f 0%, #0a4f42 55%, #062f28 100%);
    font: 15px -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif; color: #f3fbf8;
    -webkit-user-select: none; -webkit-app-region: drag;
  }
  .card { text-align: center; animation: in 500ms cubic-bezier(.2,.8,.2,1) both; }
  img { width: 112px; height: 112px; filter: drop-shadow(0 12px 28px rgb(0 0 0 / .35)); }
  h1 { margin: 18px 0 4px; font-size: 30px; font-weight: 700; letter-spacing: -0.02em; }
  p { margin: 0; color: rgb(243 251 248 / .7); font-size: 13.5px; }
  .bar { width: 120px; height: 3px; margin: 22px auto 0; border-radius: 3px; overflow: hidden; background: rgb(255 255 255 / .15); }
  .bar::after { content: ''; display: block; width: 40%; height: 100%; border-radius: 3px; background: #ffd965; animation: slide 1.1s ease-in-out infinite; }
  @keyframes in { from { opacity: 0; transform: translateY(8px) scale(.98); } }
  @keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
  @media (prefers-reduced-motion: reduce) { .card, .bar::after { animation: none; } }
</style></head>
<body><div class="card">
  <img src="${logo}" alt="">
  <h1>Sanchay</h1>
  <p>Your AI CFO · private by design</p>
  <div class="bar"></div>
</div></body></html>`
}

/** Opens the splash; call the returned function when the main window is ready to show it. */
export function showSplash(): (main: BrowserWindow) => void {
  const shownAt = Date.now()
  const splash = new BrowserWindow({
    width: 380,
    height: 340,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    show: false,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  splash.once('ready-to-show', () => splash.show())
  void splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html())}`)

  return (main) => {
    const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt))
    setTimeout(() => {
      main.show()
      if (!splash.isDestroyed()) splash.close()
    }, wait)
  }
}
