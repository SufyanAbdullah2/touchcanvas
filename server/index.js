import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultStaticDirectory = path.resolve(moduleDirectory, "../dist");
const sessions = new Map();
const sessionLifetimeMs = 30 * 60 * 1000;
const pairingAttempts = new Map();
const pairingWindowMs = 60 * 1000;
const pairingLimit = 12;

function isPrivateIPv4(address) {
  const octets = address.split(".").map(Number);
  return octets.length === 4 && (
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127)
  );
}

function isUsableIPv6(address) {
  const value = address.toLowerCase();
  return value !== "::1" && !value.startsWith("fe80") && !value.startsWith("::ffff:");
}

function interfaceFamily(entry) {
  if (entry.family === "IPv4" || entry.family === 4) return 4;
  if (entry.family === "IPv6" || entry.family === 6) return 6;
  return 0;
}

const virtualInterfacePattern = /(vethernet|wsl|vmware|virtualbox|hyper-v|loopback|tailscale|zerotier|docker|vpn|tun|tap|hamachi|radmin)/i;

function interfacePriority(name) {
  if (/^(wi-?fi|wlan|wireless)/i.test(name)) return 0;
  if (/ethernet|eth/i.test(name)) return 1;
  return 2;
}

function getLanTargets() {
  const interfaces = os.networkInterfaces();
  const targets = [];
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of (entries ?? [])) {
      if (entry.internal) continue;
      const family = interfaceFamily(entry);
      if (family === 4 && isPrivateIPv4(entry.address)) {
        targets.push({ address: entry.address, name, virtual: virtualInterfacePattern.test(name) });
      }
      if (family === 6 && isUsableIPv6(entry.address)) {
        targets.push({ address: entry.address, name, virtual: virtualInterfacePattern.test(name) });
      }
    }
  }
  const physical = targets.filter((target) => !target.virtual);
  const pool = physical.length > 0 ? physical : targets;
  const seen = new Set();
  return pool
    .filter((target) => (seen.has(target.address) ? false : seen.add(target.address)))
    .sort((left, right) => interfacePriority(left.name) - interfacePriority(right.name));
}

function getLanAddresses() {
  return getLanTargets().map((target) => target.address);
}

function formatHost(address) {
  return address.includes(":") ? `[${address}]` : address;
}

function allowPairingAttempt(key) {
  const now = Date.now();
  const attempts = (pairingAttempts.get(key) ?? []).filter((time) => now - time < pairingWindowMs);
  if (attempts.length >= pairingLimit) {
    pairingAttempts.set(key, attempts);
    return false;
  }
  attempts.push(now);
  pairingAttempts.set(key, attempts);
  if (pairingAttempts.size > 500) pairingAttempts.clear();
  return true;
}

function pruneExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(id);
  }
}

function isPoint(point) {
  return point !== null && typeof point === "object" &&
    Number.isFinite(point.x) && Number.isFinite(point.y) &&
    (point.pressure === undefined || (Number.isFinite(point.pressure) && point.pressure >= 0 && point.pressure <= 1));
}

function isStroke(stroke) {
  return stroke !== null && typeof stroke === "object" &&
    Array.isArray(stroke.points) && stroke.points.length > 0 && stroke.points.length <= 20000 &&
    stroke.points.every(isPoint) &&
    typeof stroke.color === "string" && /^#[\da-f]{6}$/i.test(stroke.color) &&
    Number.isFinite(stroke.width) && stroke.width >= 1 && stroke.width <= 100 &&
    (stroke.tool === "pen" || stroke.tool === "eraser") &&
    (stroke.shape === undefined || ["line", "rectangle", "ellipse"].includes(stroke.shape));
}

export async function startServer({ port = Number(process.env.PORT) || 4173, staticDirectory = defaultStaticDirectory } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use((_request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss:; media-src 'none'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    );
    next();
  });
  const httpServer = createServer(app);
  const io = new Server(httpServer, { maxHttpBufferSize: 1e6 });
  app.use(express.json({ limit: "32kb" }));

  app.get("/api/health", (_request, response) => response.json({ status: "ok" }));
  app.post("/api/pairings", (request, response) => {
    const padPort = Number(request.body?.port);
    if (!Number.isInteger(padPort) || padPort < 1 || padPort > 65535) {
      response.status(400).json({ error: "A valid browser port is required." });
      return;
    }
    const attemptKey = request.ip || request.socket.remoteAddress || "unknown";
    if (!allowPairingAttempt(attemptKey)) {
      response.status(429).json({ error: "Too many pairing codes were requested. Wait a minute and try again." });
      return;
    }
    pruneExpiredSessions();

    const id = crypto.randomUUID();
    const token = crypto.randomBytes(24).toString("base64url");
    const expiresAt = Date.now() + sessionLifetimeMs;
    sessions.set(id, { id, token, expiresAt, desktopSocketId: null, padSockets: new Set() });
    const targets = getLanTargets();
    const padUrls = targets.map((target) => `http://${formatHost(target.address)}:${padPort}/pad?token=${encodeURIComponent(token)}`);
    response.status(201).json({
      id,
      token,
      expiresAt,
      padUrls,
      padTargets: targets.map((target, index) => ({ address: target.address, name: target.name, url: padUrls[index] })),
    });
  });

  io.on("connection", (socket) => {
    socket.on("desktop:watch", ({ token } = {}) => {
      const session = [...sessions.values()].find((item) => item.token === token && item.expiresAt > Date.now());
      if (!session) {
        socket.emit("pair:error", "This pairing code is invalid or expired.");
        return;
      }
      session.desktopSocketId = socket.id;
      socket.data.sessionId = session.id;
      socket.data.role = "desktop";
      socket.join(`desktop:${session.id}`);
      socket.emit("desktop:ready");
    });

    socket.on("pad:join", ({ token } = {}) => {
      const session = [...sessions.values()].find((item) => item.token === token && item.expiresAt > Date.now());
      if (!session) {
        socket.emit("pair:error", "This pairing code is invalid or expired.");
        return;
      }
      session.padSockets.add(socket.id);
      socket.data.sessionId = session.id;
      socket.data.role = "pad";
      socket.join(`desktop:${session.id}`);
      io.to(`desktop:${session.id}`).emit("pad:connected");
      socket.emit("pad:joined");
    });

    const relayPadEvent = (event, isValid) => (data) => {
      const sessionId = socket.data.sessionId;
      if (socket.data.role !== "pad" || !sessionId || !isValid(data)) return;
      const session = sessions.get(sessionId);
      if (session?.desktopSocketId) io.to(session.desktopSocketId).emit(event, data);
    };

    socket.on("pad:stroke:start", relayPadEvent("pad:stroke:start", (data) =>
      data && typeof data.id === "string" && data.id.length <= 80 && isStroke(data.stroke) &&
      (data.aspect === undefined || (Number.isFinite(data.aspect) && data.aspect > 0.1 && data.aspect < 10))));
    socket.on("pad:stroke:point", relayPadEvent("pad:stroke:point", (data) =>
      data && typeof data.id === "string" && isPoint(data.point)));
    socket.on("pad:stroke:end", relayPadEvent("pad:stroke:end", (data) =>
      data && typeof data.id === "string"));
    socket.on("pad:undo", relayPadEvent("pad:undo", (data) => data === undefined));
    socket.on("pad:clear", relayPadEvent("pad:clear", (data) => data === undefined));
    socket.on("pad:viewport", relayPadEvent("pad:viewport", (data) =>
      data && Number.isFinite(data.zoomFactor) && data.zoomFactor > 0 && data.zoomFactor <= 10 &&
      Number.isFinite(data.deltaX) && Number.isFinite(data.deltaY)));

    socket.on("disconnect", () => {
      const session = sessions.get(socket.data.sessionId);
      if (!session) return;
      if (socket.data.role === "pad") {
        session.padSockets.delete(socket.id);
        io.to(`desktop:${session.id}`).emit("pad:disconnected");
      }
      if (socket.data.role === "desktop" && session.desktopSocketId === socket.id) {
        session.desktopSocketId = null;
      }
    });
  });

  const expiryTimer = setInterval(() => {
    for (const [id, session] of sessions) {
      if (session.expiresAt <= Date.now()) {
        io.to(`desktop:${id}`).emit("pair:expired");
        sessions.delete(id);
      }
    }
  }, 60_000);
  expiryTimer.unref();

  app.use(express.static(staticDirectory));
  app.get("*", (request, response, next) => {
    if (request.path.startsWith("/api/")) {
      response.status(404).json({ error: "API route not found." });
      return;
    }
    response.sendFile(path.join(staticDirectory, "index.html"), (error) => {
      if (error) next(error);
    });
  });

  await new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, "0.0.0.0", resolve);
  });
  const address = httpServer.address();
  const actualPort = typeof address === "object" && address ? address.port : port;

  return {
    httpServer,
    io,
    port: actualPort,
    close: async () => {
      clearInterval(expiryTimer);
      await new Promise((resolve, reject) => io.close((error) => error ? reject(error) : resolve()));
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 4173;
  startServer({ port }).then(({ port: actualPort }) => {
    console.log(`TouchCanvas server listening on http://localhost:${actualPort}`);
    for (const target of getLanTargets()) {
      console.log(`Phone pairing available via ${target.name} at http://${formatHost(target.address)}:${actualPort}`);
    }
  }).catch((error) => {
    console.error("Could not start TouchCanvas server:", error);
    process.exitCode = 1;
  });
}
