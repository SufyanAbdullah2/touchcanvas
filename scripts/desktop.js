import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describeSignature, ensureSigningCertificate, signFile, writeChecksums } from "./sign.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2];
const { packager } = createRequire(import.meta.url)("@electron/packager");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const appName = "TouchCanvas";
const iconPath = path.join(root, "build", "icon.ico");
const nsisVersion = "3.11";

const projectIgnores = [
  /^\/(?:src|scripts|build|release|\.azure|dist\/assets\/.+\.map)(?:\/|$)/,
  /^\/(?:index\.html|README\.md|\.gitignore|package-lock\.json|tsconfig(?:\.app|\.node)?\.json|vite\.config\.ts|postcss\.config\.js|tailwind\.config\.js)$/,
  /^\/server\/[^/]+\.test\.js$/,
  /^\/node_modules\/\.(?:bin|cache|vite|vite-temp|tmp|package-lock\.json)(?:\/|$)/,
];

function normalizeEntry(entry) {
  return `/${entry.split(path.sep).join("/")}`;
}

function productionPackageNames() {
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  const names = new Set();
  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    if (!key || entry.dev === true) continue;
    const marker = "node_modules/";
    const index = key.lastIndexOf(marker);
    names.add(index === -1 ? key : key.slice(index + marker.length));
  }
  return names;
}

function productionModuleIgnores() {
  const production = productionPackageNames();
  const modulesDir = path.join(root, "node_modules");
  const ignorePatterns = [];
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const name of fs.readdirSync(modulesDir)) {
    if (name.startsWith(".")) continue;
    const candidates = name.startsWith("@")
      ? fs.readdirSync(path.join(modulesDir, name))
          .filter((child) => fs.statSync(path.join(modulesDir, name, child)).isDirectory())
          .map((child) => `${name}/${child}`)
      : [name];
    for (const candidate of candidates) {
      if (!fs.statSync(path.join(modulesDir, candidate)).isDirectory()) continue;
      if (production.has(candidate)) continue;
      ignorePatterns.push(new RegExp(`^${escape(normalizeEntry(`node_modules/${candidate}`))}(?:/|$)`));
    }
  }
  return ignorePatterns;
}

function runNodeScript(script, args = []) {
  const result = spawnSync(process.execPath, [path.join(root, script), ...args], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} exited with code ${result.status}`);
}

async function packageApp(platform) {
  const ignore = [...projectIgnores, ...productionModuleIgnores()];
  const output = await packager({
    dir: root,
    name: appName,
    platform,
    arch: "x64",
    out: path.join(root, "release"),
    overwrite: true,
    asar: true,
    prune: false,
    icon: platform === "win32" ? iconPath : path.join(root, "build", "icon.png"),
    win32metadata: {
      CompanyName: appName,
      FileDescription: "TouchCanvas - Cross-Device Digital Sketching & Wireframing",
      ProductName: appName,
      InternalName: appName,
      OriginalFilename: `${appName}.exe`,
    },
    ignore,
  });
  console.log(`Packaged ${appName} for ${platform}: ${output.join(", ")}`);
  return output;
}

function ensureNsis() {
  const nsisRoot = path.join(root, "build", "nsis", `nsis-${nsisVersion}`);
  const makensis = path.join(nsisRoot, "makensis.exe");
  if (fs.existsSync(makensis)) return makensis;

  const zipPath = path.join(root, "build", "nsis", `nsis-${nsisVersion}.zip`);
  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  const url = `https://downloads.sourceforge.net/project/nsis/NSIS%203/${nsisVersion}/nsis-${nsisVersion}.zip`;
  console.log(`Downloading NSIS ${nsisVersion}...`);
  const curl = spawnSync("curl.exe", ["-L", "--fail", "--retry", "6", "--retry-all-errors", "--retry-delay", "3", "-C", "-", "-o", zipPath, url], { stdio: "inherit" });
  if (curl.error || curl.status !== 0) {
    run("powershell", ["-NoProfile", "-Command", `Invoke-WebRequest -Uri '${url}' -OutFile '${zipPath}' -UseBasicParsing`]);
  }
  run("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${path.dirname(zipPath)}' -Force`]);
  if (!fs.existsSync(makensis)) throw new Error(`NSIS was not extracted to ${makensis}`);
  return makensis;
}

function signWindowsArtifacts(files) {
  if (process.env.TC_SIGN === "0") {
    console.log("Code signing skipped (TC_SIGN=0).");
    return null;
  }
  const certificate = ensureSigningCertificate(root);
  for (const file of files) {
    const status = signFile(file, certificate);
    console.log(`Signed ${path.basename(file)} (${status})${certificate.trusted ? "" : " with development certificate"}`);
  }
  return certificate;
}

function buildInstaller() {
  const appDir = path.join(root, "release", `${appName}-win32-x64`);
  if (!fs.existsSync(path.join(appDir, `${appName}.exe`))) throw new Error("Run the win32 package step before building the installer.");
  const makensis = ensureNsis();
  const version = packageJson.version;
  const versionQuad = `${version}.0`.split(".").slice(0, 4).join(".");
  const outFile = path.join(root, "release", `${appName}-Setup-${version}.exe`);
  if (fs.existsSync(outFile)) fs.rmSync(outFile);
  const template = fs.readFileSync(path.join(root, "scripts", "installer.nsi"), "utf8");
  const script = template
    .replaceAll("__APP_NAME__", appName)
    .replaceAll("__APP_VERSION__", version)
    .replaceAll("__VERSION_QUAD__", versionQuad)
    .replaceAll("__SOURCE_DIR__", appDir)
    .replaceAll("__OUTPUT__", outFile)
    .replaceAll("__ICON__", iconPath);
  const scriptPath = path.join(root, "build", "installer.nsi");
  fs.writeFileSync(scriptPath, `\uFEFF${script}`, "utf8");
  console.log(`Compiling installer with NSIS ${nsisVersion}...`);
  run(makensis, [scriptPath]);
  console.log(`Installer written to ${outFile}`);
  return outFile;
}

try {
  runNodeScript("scripts/build.js");
  const appExe = path.join(root, "release", `${appName}-win32-x64`, `${appName}.exe`);
  if (target === "dev") {
    runNodeScript("node_modules/electron/cli.js", ["electron/main.cjs"]);
  } else if (target === "win32") {
    await packageApp("win32");
    signWindowsArtifacts([appExe]);
  } else if (target === "linux") {
    await packageApp("linux");
  } else if (target === "installer") {
    await packageApp("win32");
    const certificate = signWindowsArtifacts([appExe]);
    const installer = buildInstaller();
    if (certificate) {
      signWindowsArtifacts([installer]);
      const sums = writeChecksums(root, [installer, appExe]);
      console.log(`Checksums written to ${sums}`);
      console.log(`Installer signature: ${describeSignature(installer)}`);
    }
  } else {
    throw new Error("Choose a desktop target: dev, win32, linux, or installer.");
  }
} catch (error) {
  console.error("Desktop packaging failed:", error);
  process.exitCode = 1;
}
