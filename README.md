# TouchCanvas

TouchCanvas is a responsive sketching and wireframing workspace for browsers and desktop. It supports mouse, touch, and pen input, then lets a phone join the same local Wi-Fi network as a wireless drawing pad.

## Run in a browser

Use Node.js 20.19.x or 22.12+.

```sh
npm install
npm run dev
```

Open the Vite URL printed in the terminal. The development command starts both the Vite frontend and the local pairing bridge.

To run a production build:

```sh
npm run build
npm start
```

Open `http://localhost:4173`.

## Pair a phone

1. Start the app. A pairing code is created at launch; choose **Pair phone** to show the QR code.
2. Connect both devices to the same Wi-Fi network or hotspot.
3. Scan the QR code with the phone camera.
4. Draw on the phone pad; strokes are relayed live to the desktop canvas.

The bridge binds to the local network so the phone can reach it. Private IPv4 (including CGNAT), global IPv6, and IPv6 ULA addresses are offered; pick the address that matches your phone's network. Allow TouchCanvas through the operating system firewall on private networks if pairing cannot connect. Pairing tokens are random, expire after 30 minutes, and are required for phone input. The phone pad keeps its own ink history so its undo button and two-finger tap match the desktop.

## Features

- Stabilized pen and eraser strokes with pen pressure support
- Optional smart shapes: lines, rectangles, and ellipses snap automatically, or turn it off for raw freehand ink
- QR-based mobile drawing pad with live stroke streaming; phone ink is mapped through the desktop's pan and zoom without stretching
- Phone gestures: one finger draws, two fingers pan/zoom, and a two-finger tap undoes
- Desktop canvas zoom, infinite panning, dotted/grid/plain backgrounds, and wireframe templates inserted at the current view
- Undo/redo with bounded history, local browser saving, and PNG, SVG (with true eraser masks), and PDF export
- Save a sketch to a portable `.touchcanvas` file and reopen it later, with tools, colors, and canvas view restored
- Responsive browser and mobile-pad interfaces

Saved sketches stay in the current browser profile. Phone pairing is local-network only; there are no accounts or cloud uploads.

## Desktop builds

Electron is configured to create standalone Windows and Linux desktop app bundles:

```sh
npm run desktop:dev
npm run desktop:win
npm run desktop:linux
```

The Windows app folder contains `TouchCanvas.exe`; the Linux app folder contains the `TouchCanvas` executable. Build each target on its target operating system. The desktop app starts its own local bridge; the paired phone can connect to that bridge over the same Wi-Fi network.

To build a Windows installer, run:

```sh
npm run desktop:installer
```

This packages the app with the TouchCanvas icon and version metadata, then compiles `release/TouchCanvas-Setup-<version>.exe` with NSIS. The first run downloads portable NSIS into `build/nsis/`; no system-wide NSIS install is needed. The installer places shortcuts on the desktop and Start menu and registers a standard uninstaller under Settings → Apps.

### Code signing

Windows artifacts are signed with Authenticode during `desktop:installer` (and `desktop:win`). By default the build creates a local self-signed development certificate at `build/certs/touchcanvas-dev.pfx`, which is enough to verify the pipeline but will still show a SmartScreen warning because the certificate is not from a trusted root.

To sign with a real certificate, point the build at your `.pfx` before running:

```sh
set TC_SIGN_PFX=C:\path\to\codesign.pfx        # Windows
set TC_SIGN_PASSWORD=your-pfx-password
npm run desktop:installer
```

Optional overrides: `TC_SIGN_TIMESTAMP` (default `http://timestamp.sectigo.com`) and `TC_SIGN=0` to skip signing entirely. After signing, `release/SHA256SUMS.txt` records checksums for the installer and app executable.

### Linux .deb installer

Build a Debian package from the Linux app bundle (requires WSL with `dpkg-deb`, or run on Linux):

```sh
npm run desktop:linux
npm run desktop:deb
```

This produces `release/touchcanvas_<version>_amd64.deb`. It installs the app to `/usr/lib/touchcanvas`, a `touchcanvas` launcher on the PATH, a desktop entry, and hicolor icons; `chrome-sandbox` is installed setuid root as Electron requires. Install with `sudo apt install ./release/touchcanvas_0.1.0_amd64.deb`.

The app icon lives in `build/icon.png` and `build/icon.ico`. Regenerate both from a square source image with:

```sh
npm run desktop:icon -- path/to/source.png
```

## Checks

```sh
npm test
npm run build
```

## License

TouchCanvas is released under the MIT License. See [LICENSE](LICENSE).
