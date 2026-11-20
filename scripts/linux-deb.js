import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const appName = "TouchCanvas";
const pkgId = "touchcanvas";
const version = packageJson.version;
const arch = "amd64";
const linuxDir = path.join(root, "release", `${appName}-linux-x64`);
const stageDir = path.join(root, "build", "deb-stage");
const iconSrc = path.join(root, "build", "icon.png");
const licenseSrc = path.join(root, "LICENSE");
const outFile = path.join(root, "release", `${pkgId}_${version}_${arch}.deb`);

const wslRoot = `/tmp/${pkgId}-deb-root`;
const wslDeb = `/tmp/${pkgId}.deb`;
const libDir = `/usr/lib/${pkgId}`;

function dirBytes(target) {
  let total = 0;
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) total += dirBytes(full);
    else if (entry.isFile()) total += fs.statSync(full).size;
  }
  return total;
}

function writeStage() {
  fs.rmSync(stageDir, { recursive: true, force: true });
  const installedKb = Math.ceil(dirBytes(linuxDir) / 1024) + 64;

  const control = [
    `Package: ${pkgId}`,
    `Version: ${version}`,
    `Section: graphics`,
    `Priority: optional`,
    `Architecture: ${arch}`,
    `Depends: libgtk-3-0, libnotify4, libnss3, libxss1, libxtst6, xdg-utils, libatspi2.0-0, libuuid1, libsecret-1-0, libgbm1, libasound2 | libasound2t64`,
    `Installed-Size: ${installedKb}`,
    `Maintainer: ${packageJson.author ?? appName} <${pkgId}@example.com>`,
    `Homepage: https://example.com/${pkgId}`,
    `Description: Cross-device digital sketching and wireframing`,
    ` TouchCanvas turns any phone or tablet on your network into a wireless`,
    ` drawing pad for a desktop canvas. Sketch, wireframe and present from`,
    ` the couch or the conference table, with smart shapes, undo history,`,
    ` and PNG/PDF/sketch-file export.`,
    ``,
  ].join("\n");

  const postinst = [
    `#!/bin/sh`,
    `set -e`,
    `chmod 4755 ${libDir}/chrome-sandbox 2>/dev/null || true`,
    `chown root:root ${libDir}/chrome-sandbox 2>/dev/null || true`,
    `if command -v update-desktop-database >/dev/null 2>&1; then`,
    `  update-desktop-database -q /usr/share/applications 2>/dev/null || true`,
    `fi`,
    `if command -v gtk-update-icon-cache >/dev/null 2>&1; then`,
    `  gtk-update-icon-cache -q -f /usr/share/icons/hicolor 2>/dev/null || true`,
    `fi`,
    `exit 0`,
    ``,
  ].join("\n");

  const postrm = [
    `#!/bin/sh`,
    `set -e`,
    `if command -v update-desktop-database >/dev/null 2>&1; then`,
    `  update-desktop-database -q /usr/share/applications 2>/dev/null || true`,
    `fi`,
    `if command -v gtk-update-icon-cache >/dev/null 2>&1; then`,
    `  gtk-update-icon-cache -q -f /usr/share/icons/hicolor 2>/dev/null || true`,
    `fi`,
    `exit 0`,
    ``,
  ].join("\n");

  const wrapper = [`#!/bin/sh`, `exec ${libDir}/${appName} "$@"`, ``].join("\n");

  const desktop = [
    `[Desktop Entry]`,
    `Name=${appName}`,
    `Comment=Cross-device digital sketching and wireframing`,
    `Exec=${libDir}/${appName} %U`,
    `Icon=${pkgId}`,
    `Terminal=false`,
    `Type=Application`,
    `Categories=Graphics;Office;`,
    `StartupWMClass=${appName}`,
    `Keywords=sketch;draw;wireframe;whiteboard;canvas;`,
    ``,
  ].join("\n");

  const copyright = fs.existsSync(licenseSrc)
    ? fs.readFileSync(licenseSrc, "utf8")
    : `Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/\nUpstream-Name: ${appName}\n\nLicense: MIT\n`;

  const files = {
    "DEBIAN/control": control,
    "DEBIAN/postinst": postinst,
    "DEBIAN/postrm": postrm,
    "usr/bin/touchcanvas": wrapper,
    "usr/share/applications/touchcanvas.desktop": desktop,
    "usr/share/doc/touchcanvas/copyright": copyright,
  };
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(stageDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, { mode: rel.startsWith("DEBIAN/post") || rel === "usr/bin/touchcanvas" ? 0o755 : 0o644 });
  }

  // Icons: install the 1024px PNG into hicolor plus the legacy pixmaps dir.
  if (fs.existsSync(iconSrc)) {
    const hicolor = path.join(stageDir, "usr/share/icons/hicolor/1024x1024/apps/touchcanvas.png");
    const pixmap = path.join(stageDir, "usr/share/pixmaps/touchcanvas.png");
    fs.mkdirSync(path.dirname(hicolor), { recursive: true });
    fs.mkdirSync(path.dirname(pixmap), { recursive: true });
    fs.copyFileSync(iconSrc, hicolor);
    fs.copyFileSync(iconSrc, pixmap);
  }
  return installedKb;
}

function have(cmd) {
  return new Promise((resolve) => {
    const probe = spawn(cmd, ["-e", "true"], { stdio: "ignore" });
    probe.on("error", () => resolve(false));
    probe.on("close", (code) => resolve(code === 0));
  });
}

// Stream `tar -cf - -C srcDir .` into a WSL bash script that reads stdin.
function pipeTarIntoWsl(srcDir, wslScript) {
  return new Promise((resolve, reject) => {
    const tar = spawn("tar", ["-cf", "-", "-C", srcDir, "."], { stdio: ["ignore", "pipe", "inherit"] });
    const wsl = spawn("wsl", ["-e", "bash", "-c", wslScript], { stdio: ["pipe", "inherit", "inherit"] });
    let tarCode = null;
    let wslCode = null;
    let tarErr = null;
    let wslErr = null;
    const settle = () => {
      if (tarCode === null || wslCode === null) return;
      if (tarErr) return reject(tarErr);
      if (wslErr) return reject(wslErr);
      if (tarCode !== 0) return reject(new Error(`tar of ${srcDir} exited ${tarCode}`));
      if (wslCode !== 0) return reject(new Error(`WSL step exited ${wslCode}`));
      resolve();
    };
    tar.on("error", (e) => { tarErr = e; tarCode = tarCode ?? -1; settle(); });
    wsl.on("error", (e) => { wslErr = e; wslCode = wslCode ?? -1; settle(); });
    tar.on("close", (c) => { tarCode = c; tar.stdout.destroy(); settle(); });
    wsl.on("close", (c) => { wslCode = c; settle(); });
    tar.stdout.pipe(wsl.stdin);
  });
}

// Run a WSL bash script, streaming its stdout into a file.
function wslStdoutToFile(wslScript, dest) {
  return new Promise((resolve, reject) => {
    const wsl = spawn("wsl", ["-e", "bash", "-c", wslScript], { stdio: ["ignore", "pipe", "inherit"] });
    const out = fs.createWriteStream(dest);
    let wslCode = null;
    let outDone = false;
    let wslErr = null;
    const settle = () => {
      if (wslCode === null || !outDone) return;
      if (wslErr) return reject(wslErr);
      if (wslCode !== 0) return reject(new Error(`WSL build step exited ${wslCode}`));
      resolve();
    };
    wsl.on("error", (e) => { wslErr = e; wslCode = wslCode ?? -1; settle(); });
    out.on("error", (e) => { reject(e); });
    wsl.on("close", (c) => { wslCode = c; out.end(); });
    out.on("close", () => { outDone = true; settle(); });
    wsl.stdout.pipe(out);
  });
}

function wslRun(wslScript) {
  return new Promise((resolve, reject) => {
    const wsl = spawn("wsl", ["-e", "bash", "-c", wslScript], { stdio: "inherit" });
    wsl.on("error", reject);
    wsl.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`WSL step exited ${c}`))));
  });
}

async function main() {
  if (!fs.existsSync(path.join(linuxDir, appName))) {
    throw new Error(`Linux package not found at ${linuxDir}. Run "npm run desktop:linux" first.`);
  }
  if (!(await have("wsl"))) {
    throw new Error("WSL is required to build the .deb on Windows. Install WSL (with dpkg-deb) or run this script on Linux.");
  }

  const installedKb = writeStage();
  console.log(`Staged control files (Installed-Size ~${installedKb} KB).`);

  console.log("Streaming control/stage tree into WSL...");
  await pipeTarIntoWsl(stageDir, `set -e; rm -rf ${wslRoot}; mkdir -p ${wslRoot}; tar -xf - -C ${wslRoot}`);

  console.log("Streaming application payload into WSL (this can take a minute)...");
  await pipeTarIntoWsl(linuxDir, `set -e; mkdir -p ${wslRoot}${libDir}; tar -xf - -C ${wslRoot}${libDir}`);

  console.log("Fixing permissions and building the package...");
  const libRel = `usr/lib/${pkgId}`;
  await wslRun(
    [
      `set -e`,
      `cd ${wslRoot}`,
      `find . -type d -exec chmod 0755 {} +`,
      `find ${libRel} -type f -exec chmod 0644 {} +`,
      `chmod 0755 ${libRel}/${appName} ${libRel}/chrome_crashpad_handler`,
      `find ${libRel} -name '*.so*' -exec chmod 0755 {} +`,
      `chmod 4755 ${libRel}/chrome-sandbox`,
      `chmod 0755 usr/bin/${pkgId} DEBIAN/postinst DEBIAN/postrm`,
      `chmod 0644 DEBIAN/control`,
      `rm -f ${wslDeb}`,
      `dpkg-deb -Zgzip --root-owner-group --build ${wslRoot} ${wslDeb}`,
    ].join("\n"),
  );

  if (fs.existsSync(outFile)) fs.rmSync(outFile);
  console.log(`Copying ${path.basename(outFile)} back to Windows...`);
  await wslStdoutToFile(`cat ${wslDeb}`, outFile);

  const sizeMb = (fs.statSync(outFile).size / 1024 / 1024).toFixed(1);
  console.log(`\nBuilt ${outFile} (${sizeMb} MB)`);

  console.log("\nPackage info:");
  await wslRun(`dpkg-deb --info ${wslDeb}`);
  console.log("\nFirst entries:");
  await wslRun(`dpkg-deb --contents ${wslDeb} | head -15`);

  const checksumFile = path.join(root, "release", "SHA256SUMS.txt");
  const checksumLines = fs.existsSync(checksumFile)
    ? fs.readFileSync(checksumFile, "utf8").trim().split("\n").filter(Boolean)
    : [];
  const fileHash = crypto.createHash("sha256").update(fs.readFileSync(outFile)).digest("hex");
  const nextLines = checksumLines.filter((line) => line.slice(64).trim() !== path.basename(outFile));
  nextLines.push(`${fileHash}  ${path.basename(outFile)}`);
  fs.writeFileSync(checksumFile, `${nextLines.join("\n")}\n`);
  console.log(`Checksum appended to ${checksumFile}`);
}

main().catch((error) => {
  console.error("Linux .deb build failed:", error.message ?? error);
  process.exitCode = 1;
});
