import { io } from "socket.io-client";

/**
 * Where the pairing bridge lives.
 * - a string with a URL: use that server
 * - "" (empty): same origin as the page (local dev, `npm start`, desktop app)
 * - null: static hosting (GitHub Pages etc.) with no server configured
 */
export function getBackendUrl(): string | null {
  const configured = (import.meta.env.VITE_TOUCHCANVAS_BACKEND_URL as string | undefined)?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const host = window.location.hostname;
  if (host.endsWith("github.io") || host.endsWith("pages.dev")) return null;
  return "";
}

export function connectSocket(backendUrl: string) {
  const transports: ("websocket" | "polling")[] = ["websocket", "polling"];
  return backendUrl ? io(backendUrl, { transports }) : io({ transports });
}
