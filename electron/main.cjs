const { app, BrowserWindow, dialog, shell } = require("electron");

// A fixed port keeps the page origin (and so the saved sketch in localStorage) the same on every launch.
const preferredPort = 47173;

let bridge = null;
let mainWindow = null;
let closing = false;

async function startBridge() {
  const { startServer } = await import("../server/index.js");
  try {
    return await startServer({ port: preferredPort });
  } catch (error) {
    // Port busy: fall back to any free port (the saved sketch will not carry over in that case).
    console.warn(`Port ${preferredPort} unavailable (${error.message}); using a random port.`);
    return startServer({ port: 0 });
  }
}

function openExternally(url) {
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
}

async function createWindow() {
  bridge = await startBridge();
  const origin = `http://127.0.0.1:${bridge.port}`;

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 850,
    minHeight: 620,
    title: "TouchCanvas",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.on("closed", () => { mainWindow = null; });

  // Keep the window on the local app; open any other link in the normal browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(origin)) {
      event.preventDefault();
      openExternally(url);
    }
  });

  await mainWindow.loadURL(origin);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(createWindow).catch((error) => {
    dialog.showErrorBox("TouchCanvas could not start", String(error && error.message ? error.message : error));
    app.quit();
  });

  app.on("window-all-closed", () => app.quit());

  app.on("before-quit", (event) => {
    if (!bridge || closing) return;
    event.preventDefault();
    closing = true;
    const finish = () => { bridge = null; app.quit(); };
    Promise.race([
      bridge.close().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]).then(finish, finish);
  });
}
