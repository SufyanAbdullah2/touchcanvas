const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = process.argv[2] || path.join(process.env.TEMP || ".", "touchcanvas-icon.png");
const outDir = process.argv[3] || path.join(root, "build");
const sizes = [16, 24, 32, 48, 64, 128, 256];

const renderer = `(async () => {
  const sourceDataUrl = window.__SOURCE__;
  const sizes = window.__SIZES__;
  const image = new Image();
  image.src = sourceDataUrl;
  await image.decode();

  function roundedCanvas(size) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    const radius = size * 0.225;
    context.beginPath();
    context.moveTo(radius, 0);
    context.lineTo(size - radius, 0);
    context.quadraticCurveTo(size, 0, size, radius);
    context.lineTo(size, size - radius);
    context.quadraticCurveTo(size, size, size - radius, size);
    context.lineTo(radius, size);
    context.quadraticCurveTo(0, size, 0, size - radius);
    context.lineTo(0, radius);
    context.quadraticCurveTo(0, 0, radius, 0);
    context.closePath();
    context.clip();
    context.drawImage(image, 0, 0, size, size);
    return canvas;
  }

  function bmpEntry(size) {
    const canvas = roundedCanvas(size);
    const data = canvas.getContext("2d").getImageData(0, 0, size, size).data;
    const maskRowBytes = Math.ceil(size / 32) * 4;
    const xorSize = size * size * 4;
    const andSize = maskRowBytes * size;
    const buffer = new ArrayBuffer(40 + xorSize + andSize);
    const view = new DataView(buffer);
    view.setUint32(0, 40, true);
    view.setInt32(4, size, true);
    view.setInt32(8, size * 2, true);
    view.setUint16(12, 1, true);
    view.setUint16(14, 32, true);
    view.setUint32(20, xorSize + andSize, true);
    const bytes = new Uint8Array(buffer);
    let offset = 40;
    for (let y = size - 1; y >= 0; y -= 1) {
      for (let x = 0; x < size; x += 1) {
        const pixel = (y * size + x) * 4;
        bytes[offset] = data[pixel + 2];
        bytes[offset + 1] = data[pixel + 1];
        bytes[offset + 2] = data[pixel];
        bytes[offset + 3] = data[pixel + 3];
        offset += 4;
      }
    }
    offset += andSize;
    return new Uint8Array(buffer);
  }

  const entries = sizes.map((size) => ({ size, data: bmpEntry(size) }));
  const headerSize = 6 + entries.length * 16;
  const totalSize = headerSize + entries.reduce((sum, entry) => sum + entry.data.length, 0);
  const ico = new Uint8Array(totalSize);
  const view = new DataView(ico.buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, entries.length, true);
  let dataOffset = headerSize;
  entries.forEach((entry, index) => {
    const dir = 6 + index * 16;
    ico[dir] = entry.size >= 256 ? 0 : entry.size;
    ico[dir + 1] = entry.size >= 256 ? 0 : entry.size;
    view.setUint16(dir + 4, 1, true);
    view.setUint16(dir + 6, 32, true);
    view.setUint32(dir + 8, entry.data.length, true);
    view.setUint32(dir + 12, dataOffset, true);
    ico.set(entry.data, dataOffset);
    dataOffset += entry.data.length;
  });

  function toBase64(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunk));
    }
    return btoa(binary);
  }

  const png1024 = roundedCanvas(1024).toDataURL("image/png").split(",")[1];
  return { ico: toBase64(ico), png1024 };
})()`;

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    width: 1200,
    height: 1200,
    webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false },
  });
  await window.loadURL("data:text/html,<html><body></body></html>");
  await window.webContents.executeJavaScript(
    `window.__SOURCE__ = ${JSON.stringify(`data:image/png;base64,${fs.readFileSync(source).toString("base64")}`)}; window.__SIZES__ = ${JSON.stringify(sizes)};`,
  );
  const { ico, png1024 } = await window.webContents.executeJavaScript(renderer);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "icon.png"), Buffer.from(png1024, "base64"));
  fs.writeFileSync(path.join(outDir, "icon.ico"), Buffer.from(ico, "base64"));
  console.log(`Wrote ${path.join(outDir, "icon.png")} and ${path.join(outDir, "icon.ico")}`);
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
