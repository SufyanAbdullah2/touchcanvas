# TouchCanvas Project Plan

## Goal

Build TouchCanvas as a responsive browser and desktop sketching app with a local-network phone drawing companion.

## Product Scope

- Responsive HTML5 Canvas drawing surface
- Mouse, pen, and touch drawing
- Stabilized ink and pen pressure support
- Pen and eraser tools
- Basic color picker and stroke-width controls
- Undo and redo
- Clear canvas action
- Automatic line, rectangle, and ellipse recognition
- QR pairing and live local-network phone input
- Two-finger pan/zoom and undo gesture
- Infinite pan/zoom workspace and wireframe starter template
- PNG, SVG, and PDF export
- Local browser persistence
- Electron desktop packages for Windows and Linux

## Recommended Implementation

- React for the interface and state
- HTML5 Canvas for drawing
- Tailwind CSS for responsive styling
- Browser pointer events for unified mouse, pen, and touch handling
- Node.js, Express, and Socket.IO local bridge for phone pairing
- Electron for Windows and Linux desktop packaging
- Vite for local development and production builds

## User Flow

1. Open the browser or desktop app.
2. Draw on the canvas or pair a phone over the same Wi-Fi network.
3. Use drawing tools, smart shapes, templates, and viewport gestures.
4. Save locally or export a PNG, SVG, or PDF.

## Acceptance Criteria

- Desktop and phone can pair using a QR code over a private local network.
- Phone strokes are relayed live and support pen, touch, and eraser input.
- Phone two-finger gestures pan/zoom; a two-finger tap undoes.
- The canvas supports shape recognition, panning, zooming, templates, and undo/redo.
- Drawings persist locally and can be exported as PNG, SVG, and PDF.
- Browser production build and platform-specific desktop build commands are documented.

## Verification

- Test drawing history, shape recognition, viewport math, rendering, and pairing relay behavior.
- Run unit/integration tests and production build.
- Manually verify desktop, phone pairing, and responsive behavior in a browser.

## Delivery Sequence

1. Extend the Phase 1 canvas with smart shapes and infinite panning/zoom.
2. Add the secure local pairing bridge and mobile pad.
3. Add gestures, templates, local saving, and export.
4. Configure and verify Electron packaging workflows.
