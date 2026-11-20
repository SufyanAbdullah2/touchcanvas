import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const processes = [
  spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "--host", "0.0.0.0"], { cwd: root, stdio: "inherit" }),
  spawn(process.execPath, [path.join(root, "server/index.js")], { cwd: root, stdio: "inherit" }),
];
let stopping = false;

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  processes.forEach((child) => {
    if (!child.killed) child.kill();
  });
  process.exitCode = exitCode;
}

processes.forEach((child) => {
  child.on("error", (error) => {
    console.error("Could not start a development service:", error);
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) stop(code || 0);
  });
});

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
