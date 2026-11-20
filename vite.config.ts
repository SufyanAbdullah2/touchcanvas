import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_PAGES === "true" ? "/touchcanvas/" : "/",
  server: {
    host: true,
    allowedHosts: true,
    strictPort: false,
    proxy: {
      "/api": "http://127.0.0.1:4173",
      "/socket.io": {
        target: "http://127.0.0.1:4173",
        ws: true,
      },
    },
  },
  test: {
    environment: "node",
  },
});
