# Changelog

## v0.1.0 — 2026-11-20

### Added

- Stabilized mouse, touch, pen, and pressure-aware drawing
- Eraser, undo/redo, smart shape recognition, templates, backgrounds, and pan/zoom
- QR-based phone drawing pad with live stroke streaming
- Space-drag and plain-scroll canvas panning; Ctrl/Meta-scroll and trackpad pinch zoom
- Palm rejection while a pen stroke is active
- PNG, SVG, PDF, and portable `.touchcanvas` file exports
- Windows desktop app, Windows installer, Linux app bundle, and Linux `.deb` package
- GitHub Pages web deployment and public GitHub release assets
- MIT open-source license

### Fixed

- Desktop app now uses a stable local port and prevents duplicate app instances
- Public static hosting reports a clear pairing-backend requirement instead of parsing HTML as JSON
- Mobile taps, cancelled strokes, and gesture handling are kept consistent
- PDF export uses a reliable Blob download
- Production security headers and pairing request limits were hardened

### Known limitations

- The GitHub Pages site is a static UI and does not host the WebSocket pairing bridge
- The phone drawing pad requires the desktop app or a separately deployed Node pairing server
- Windows installers use a development signing certificate until a trusted EV/OV PFX is added
- Linux bundles should be run-tested on the target Linux distribution
- Physical phone-to-desktop pairing must be tested on the user's own Wi-Fi network
