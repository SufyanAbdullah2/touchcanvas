import { afterEach, describe, expect, it } from "vitest";
import { io as createClient } from "socket.io-client";
import { startServer } from "./index.js";

let bridge;
let clients = [];

function waitFor(socket, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handleEvent);
      reject(new Error(`Timed out waiting for ${event}`));
    }, 3000);
    const handleEvent = (value) => {
      clearTimeout(timer);
      resolve(value);
    };
    socket.once(event, handleEvent);
  });
}

async function openClient(port) {
  const client = createClient(`http://127.0.0.1:${port}`, { transports: ["websocket"] });
  clients.push(client);
  await waitFor(client, "connect");
  return client;
}

describe("TouchCanvas local pairing bridge", () => {
  afterEach(async () => {
    clients.forEach((client) => client.disconnect());
    clients = [];
    if (bridge) await bridge.close();
    bridge = undefined;
  });

  it("adds safe browser headers and rejects unsupported pairing data", async () => {
    bridge = await startServer({ port: 0 });
    const baseUrl = `http://127.0.0.1:${bridge.port}`;
    const health = await fetch(`${baseUrl}/api/health`);
    expect(health.headers.get("x-content-type-options")).toBe("nosniff");
    expect(health.headers.get("x-frame-options")).toBe("DENY");
    expect(health.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(health.headers.get("x-powered-by")).toBeNull();

    const invalidJson = await fetch(`${baseUrl}/api/pairings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ port: 70000 }),
    });
    expect(invalidJson.status).toBe(400);
  });

  it("creates a pairing and relays authenticated phone strokes to the desktop", async () => {
    bridge = await startServer({ port: 0 });
    const baseUrl = `http://127.0.0.1:${bridge.port}`;
    const invalid = await fetch(`${baseUrl}/api/pairings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ port: -1 }),
    });
    expect(invalid.status).toBe(400);

    const response = await fetch(`${baseUrl}/api/pairings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ port: 5173 }),
    });
    expect(response.status).toBe(201);
    const pairing = await response.json();
    expect(pairing.token).toBeTruthy();

    const desktop = await openClient(bridge.port);
    const desktopReady = waitFor(desktop, "desktop:ready");
    desktop.emit("desktop:watch", { token: pairing.token });
    await desktopReady;

    const phone = await openClient(bridge.port);
    const phoneJoined = waitFor(phone, "pad:joined");
    phone.emit("pad:join", { token: pairing.token });
    await phoneJoined;

    const incomingStroke = waitFor(desktop, "pad:stroke:start");
    phone.emit("pad:stroke:start", {
      id: "stroke-1",
      stroke: {
        points: [{ x: 0.1, y: 0.2, pressure: 0.8 }],
        color: "#28334a",
        width: 5,
        tool: "pen",
      },
    });
    await expect(incomingStroke).resolves.toMatchObject({
      id: "stroke-1",
      stroke: { points: [{ x: 0.1, y: 0.2, pressure: 0.8 }] },
    });
  });

  it("rejects a phone using an invalid pairing token", async () => {
    bridge = await startServer({ port: 0 });
    const missingApi = await fetch(`http://127.0.0.1:${bridge.port}/api/missing`);
    expect(missingApi.status).toBe(404);
    await expect(missingApi.json()).resolves.toMatchObject({ error: "API route not found." });

    const phone = await openClient(bridge.port);
    const pairingError = waitFor(phone, "pair:error");
    phone.emit("pad:join", { token: "not-a-valid-token" });
    await expect(pairingError).resolves.toMatch(/invalid or expired/i);
  });
});
