import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const commands = [
  ["node_modules/typescript/bin/tsc", ["-b"]],
  ["node_modules/vite/bin/vite.js", ["build"]],
];

for (const [command, args] of commands) {
  const result = spawnSync(process.execPath, [path.join(root, command), ...args], { cwd: root, stdio: "inherit" });
  if (result.error) {
    console.error(`Could not run ${command}:`, result.error);
    process.exitCode = 1;
    break;
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
