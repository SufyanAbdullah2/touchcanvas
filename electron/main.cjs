const { app, BrowserWindow } = require("electron");

let bridge;

app.whenReady().then(async () => {
  const { startServer } = await import("../server/index.js");
  bridge = await startServer({ port: 0 });

  const window = new BrowserWindow({
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
  await window.loadURL(`http://127.0.0.1:${bridge.port}`);
});

app.on("before-quit", () => {
  if (bridge) void bridge.close();
});
