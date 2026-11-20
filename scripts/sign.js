import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const devPassword = "touchcanvas-dev-password";
const defaultTimestamp = "http://timestamp.sectigo.com";

// PowerShell occasionally dies during heavy builds with a process-init crash
// (0xC0000142 DLL_INIT_FAILED, 0xC0000005 access violation). These are transient.
const transientExitCodes = new Set([3221225794, 3221225477, 3221226505]);

function sleep(ms) {
  const wait = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(wait, 0, 0, ms);
}

function powershell(command) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const result = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
      encoding: "utf8",
      shell: false,
    });
    if (result.error) throw result.error;
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    if (result.status === 0) return output;
    lastError = new Error(output || `PowerShell exited with code ${result.status}`);
    if (!transientExitCodes.has(result.status >>> 0) || attempt === 4) break;
    console.warn(`PowerShell crashed (code ${result.status}); retry ${attempt}/3...`);
    sleep(1500 * attempt);
  }
  throw lastError;
}

export function ensureSigningCertificate(root) {
  const pfx = process.env.TC_SIGN_PFX;
  if (pfx) {
    if (!fs.existsSync(pfx)) throw new Error(`TC_SIGN_PFX points at a missing file: ${pfx}`);
    return { pfx, password: process.env.TC_SIGN_PASSWORD ?? "", trusted: true };
  }
  const certDir = path.join(root, "build", "certs");
  const devPfx = path.join(certDir, "touchcanvas-dev.pfx");
  if (!fs.existsSync(devPfx)) {
    fs.mkdirSync(certDir, { recursive: true });
    console.log("Creating a local development code-signing certificate...");
    powershell(
      `$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject 'CN=TouchCanvas Development Signer' -CertStoreLocation 'Cert:\\CurrentUser\\My' -NotAfter (Get-Date).AddYears(2);` +
      `$pw = ConvertTo-SecureString -String '${devPassword}' -Force -AsPlainText;` +
      `Export-PfxCertificate -Cert $cert -FilePath '${devPfx}' -Password $pw | Out-Null`,
    );
  }
  return { pfx: devPfx, password: process.env.TC_SIGN_PASSWORD ?? devPassword, trusted: false };
}

export function signFile(file, certificate, { timestamp = true } = {}) {
  const stamp = timestamp ? ` -TimestampServer '${process.env.TC_SIGN_TIMESTAMP ?? defaultTimestamp}'` : "";
  const command =
    `$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2('${certificate.pfx}', '${certificate.password.replace(/'/g, "''")}');` +
    `$result = Set-AuthenticodeSignature -FilePath '${file}' -Certificate $cert -HashAlgorithm SHA256${stamp};` +
    `Write-Output ('SIGN_STATUS=' + $result.Status.ToString() + ' | ' + $result.StatusMessage)`;
  const run = () => powershell(command).split("\n").map((line) => line.trim()).find((line) => line.startsWith("SIGN_STATUS="))?.replace("SIGN_STATUS=", "") ?? "";
  let status = run();
  if (!signedOk(status) && timestamp) status = signFile(file, certificate, { timestamp: false });
  if (!signedOk(status)) throw new Error(`Authenticode signing of ${path.basename(file)} failed: ${status}`);
  return status;
}

function signedOk(status) {
  // UnknownError/NotTrusted still mean a real signature exists (self-signed dev certs are not in a trust store).
  return /^(Valid|UnknownError|NotTrusted)\b/.test(status);
}

export function describeSignature(file) {
  const output = powershell(
    `$s = Get-AuthenticodeSignature -FilePath '${file}';` +
    `Write-Output (($s.Status.ToString() + ' | ' + $s.SignerCertificate.Subject + ' | ' + $s.StatusMessage))`,
  );
  return output.split("\n").pop()?.trim() ?? "unknown";
}

export function writeChecksums(root, files) {
  const lines = files.map((file) => {
    const hash = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    return `${hash}  ${path.basename(file)}`;
  });
  const target = path.join(root, "release", "SHA256SUMS.txt");
  fs.writeFileSync(target, `${lines.join("\n")}\n`);
  return target;
}
