# TouchCanvas public deployment

The GitHub Pages site hosts the browser UI. It needs a separate Node server for pairing and WebSocket sync.

1. Deploy this repository to Render using `render.yaml`.
2. Copy the public HTTPS service URL.
3. Set `VITE_TOUCHCANVAS_BACKEND_URL` to that URL when building the static site.
4. Redeploy GitHub Pages or replace the build environment with the backend URL.

The backend itself serves both the built app and the `/api/pairings` and `/socket.io` endpoints.
