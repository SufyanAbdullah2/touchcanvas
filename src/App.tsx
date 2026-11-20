import { useEffect, useRef, useState, useReducer } from "react";
import { io } from "socket.io-client";
import { QRCodeSVG } from "qrcode.react";
import {
  Check,
  Download,
  Eraser,
  Grid2X2,
  Minus,
  Plus,
  Redo2,
  RotateCcw,
  Undo2,
  Wifi,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import DrawingCanvas from "./components/DrawingCanvas";
import MobilePad from "./components/MobilePad";
import { createSvg, downloadPng, downloadText } from "./drawing/export";
import { parseSketch, serializeSketch } from "./drawing/sketchFile";
import { canRedo, canUndo, historyReducer, initialHistory } from "./drawing/history";
import { initialToolState, toolReducer } from "./drawing/tools";
import { recognizeShape } from "./drawing/shapes";
import { createWireframeTemplate } from "./drawing/templates";
import { fractionPointToWorld, initialViewport, panBy, zoomAt } from "./drawing/viewport";
import { createPadFrame, mapPadPoint, type PadFrame } from "./drawing/padMapping";
import type { CanvasBackground, DrawingHistory, DrawingTool, RemoteStroke, Stroke, ToolState, Viewport } from "./drawing/types";

const colors = ["#28334a", "#ed6a5a", "#4b8f8c", "#e7a83e", "#8b74c7", "#222222"];
const storageKey = "touchcanvas.workspace.v1";

interface Pairing {
  id: string;
  token: string;
  padUrls: string[];
  padTargets?: { address: string; name: string; url: string }[];
  expiresAt: number;
}

type StoredTools = Omit<ToolState, "smartShapes"> & { smartShapes?: boolean };

interface SavedWorkspace {
  history: DrawingHistory;
  tools: ToolState;
  warning: string;
}

function isSavedWorkspace(value: unknown): value is { history: DrawingHistory; tools: StoredTools } {
  if (!value || typeof value !== "object") return false;
  const saved = value as { history?: DrawingHistory; tools?: Partial<ToolState> };
  return Boolean(
    saved.history &&
    Array.isArray(saved.history.present) &&
    Array.isArray(saved.history.past) &&
    Array.isArray(saved.history.future) &&
    saved.history.present.every((stroke) => stroke && Array.isArray(stroke.points)) &&
    saved.tools &&
    ["pen", "eraser"].includes(saved.tools.tool ?? "") &&
    typeof saved.tools.color === "string" &&
    Number.isFinite(saved.tools.width) &&
    ["dots", "grid", "plain"].includes(saved.tools.background ?? "") &&
    (saved.tools.smartShapes === undefined || typeof saved.tools.smartShapes === "boolean"),
  );
}

function readWorkspace(): SavedWorkspace {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return { history: initialHistory, tools: initialToolState, warning: "" };
    const value: unknown = JSON.parse(stored);
    if (isSavedWorkspace(value)) {
      return { history: value.history, tools: { ...initialToolState, ...value.tools }, warning: "" };
    }
    return { history: initialHistory, tools: initialToolState, warning: "Saved sketch data is invalid; a blank canvas was loaded." };
  } catch {
    return { history: initialHistory, tools: initialToolState, warning: "Saved sketch data could not be read; storage may be unavailable." };
  }
}

function App() {
  const isPad = /(?:^|\/)pad\/?$/.test(window.location.pathname);
  return isPad ? <MobilePad /> : <Studio />;
}

function Studio() {
  const [workspace] = useState(readWorkspace);
  const [history, dispatchHistory] = useReducer(historyReducer, workspace.history);
  const [tools, dispatchTools] = useReducer(toolReducer, workspace.tools);
  const [viewport, setViewport] = useState<Viewport>(initialViewport);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const toolsRef = useRef(tools);
  toolsRef.current = tools;
  const [remoteDraft, setRemoteDraft] = useState<RemoteStroke | null>(null);
  const remoteDraftRef = useRef<RemoteStroke | null>(null);
  const padFrameRef = useRef<PadFrame | null>(null);
  const remoteFlushRef = useRef<number | null>(null);
  const initialSaveRef = useRef(true);
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const pairingRef = useRef<Pairing | null>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const sketchFileRef = useRef<HTMLInputElement>(null);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [selectedPadUrl, setSelectedPadUrl] = useState("");
  const [pairStatus, setPairStatus] = useState<"idle" | "connected" | "disconnected">("idle");
  const [pairOpen, setPairOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [notice, setNotice] = useState(workspace.warning || "Saved on this device");

  useEffect(() => {
    if (initialSaveRef.current) {
      initialSaveRef.current = false;
      return;
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        history: { past: [], present: history.present, future: [] },
        tools,
      }));
      setNotice("Saved on this device");
    } catch {
      setNotice("Could not save locally; export your sketch to keep a copy.");
    }
  }, [history, tools]);

  useEffect(() => {
    const backendUrl = (import.meta.env.VITE_TOUCHCANVAS_BACKEND_URL as string | undefined)?.replace(/\/$/, "");
    const socket = io(backendUrl || undefined, { transports: ["websocket", "polling"] });
    socketRef.current = socket;
    const scheduleRemoteDraft = () => {
      if (remoteFlushRef.current !== null) return;
      remoteFlushRef.current = requestAnimationFrame(() => {
        remoteFlushRef.current = null;
        setRemoteDraft(remoteDraftRef.current);
      });
    };
    socket.on("connect", () => {
      if (pairingRef.current) socket.emit("desktop:watch", { token: pairingRef.current.token });
    });
    socket.on("desktop:ready", () => setPairStatus((current) => current === "connected" ? current : "idle"));
    socket.on("pad:connected", () => setPairStatus("connected"));
    socket.on("pad:disconnected", () => setPairStatus("disconnected"));
    socket.on("pair:error", (message: string) => {
      setPairStatus("disconnected");
      setNotice(message);
    });
    socket.on("pair:expired", () => {
      pairingRef.current = null;
      setPairing(null);
      setPairStatus("idle");
      setNotice("The phone pairing code expired. Create a new code to reconnect.");
    });
    socket.on("pad:stroke:start", (data: RemoteStroke & { aspect?: number }) => {
      const rect = paperRef.current?.getBoundingClientRect();
      const width = rect && rect.width > 0 ? rect.width : 1;
      const height = rect && rect.height > 0 ? rect.height : 1;
      const frame = createPadFrame(viewportRef.current, width, height, data.aspect ?? width / height);
      padFrameRef.current = frame;
      remoteDraftRef.current = {
        id: data.id,
        stroke: {
          ...data.stroke,
          points: data.stroke.points.map((point) => mapPadPoint(point, frame)),
        },
      };
      scheduleRemoteDraft();
    });
    socket.on("pad:stroke:point", (data: { id: string; point: Stroke["points"][number] }) => {
      const current = remoteDraftRef.current;
      const frame = padFrameRef.current;
      if (!current || !frame || current.id !== data.id) return;
      remoteDraftRef.current = {
        ...current,
        stroke: { ...current.stroke, points: [...current.stroke.points, mapPadPoint(data.point, frame)] },
      };
      scheduleRemoteDraft();
    });
    socket.on("pad:stroke:end", (data: { id: string }) => {
      const current = remoteDraftRef.current;
      if (!current || current.id !== data.id) return;
      if (remoteFlushRef.current !== null) {
        cancelAnimationFrame(remoteFlushRef.current);
        remoteFlushRef.current = null;
      }
      dispatchHistory({
        type: "add-stroke",
        stroke: toolsRef.current.smartShapes ? recognizeShape(current.stroke) : current.stroke,
      });
      remoteDraftRef.current = null;
      padFrameRef.current = null;
      setRemoteDraft(null);
    });
    socket.on("pad:undo", () => dispatchHistory({ type: "undo" }));
    socket.on("pad:clear", () => dispatchHistory({ type: "clear" }));
    socket.on("pad:viewport", (data: { zoomFactor: number; deltaX: number; deltaY: number }) => {
      const rect = paperRef.current?.getBoundingClientRect();
      if (!rect) return;
      const next = zoomAt(viewportRef.current, data.zoomFactor, rect.width / 2, rect.height / 2);
      setViewport(panBy(next, data.deltaX * rect.width, data.deltaY * rect.height));
    });
    return () => {
      if (remoteFlushRef.current !== null) cancelAnimationFrame(remoteFlushRef.current);
      remoteFlushRef.current = null;
      padFrameRef.current = null;
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const target = event.target;
      if (target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        dispatchHistory({ type: event.shiftKey ? "redo" : "undo" });
      } else if (key === "y") {
        event.preventDefault();
        dispatchHistory({ type: "redo" });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const clearCanvas = () => {
    if (history.present.length > 0 && window.confirm("Clear the entire canvas? You can undo this action.")) {
      dispatchHistory({ type: "clear" });
    }
  };

  const selectTool = (tool: DrawingTool) => dispatchTools({ type: "set-tool", tool });

  const createPairing = async (open: boolean) => {
    try {
      const backendUrl = (import.meta.env.VITE_TOUCHCANVAS_BACKEND_URL as string | undefined)?.replace(/\/$/, "") ?? "";
      const response = await fetch(`${backendUrl}/api/pairings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ port: Number(window.location.port) || (window.location.protocol === "https:" ? 443 : 80) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not create a phone pairing.");
      const next: Pairing = result;
      pairingRef.current = next;
      setPairing(next);
      setSelectedPadUrl(next.padUrls[0] ?? "");
      setPairStatus("idle");
      if (open) setPairOpen(true);
      socketRef.current?.emit("desktop:watch", { token: next.token });
      if (next.padUrls.length === 0) setNotice("No private Wi-Fi address was found. Connect both devices to the same Wi-Fi and try again.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create a phone pairing.");
      if (open) setPairOpen(true);
    }
  };

  const openPairing = async () => {
    const existing = pairingRef.current;
    if (existing && existing.expiresAt > Date.now()) {
      setPairing(existing);
      setSelectedPadUrl(existing.padUrls[0] ?? "");
      setPairOpen(true);
      socketRef.current?.emit("desktop:watch", { token: existing.token });
      return;
    }
    await createPairing(true);
  };

  useEffect(() => {
    void createPairing(false);
  }, []);

  const exportSketch = async (format: "png" | "svg" | "pdf") => {
    try {
      const rect = paperRef.current?.getBoundingClientRect();
      if (!rect || rect.width < 1 || rect.height < 1) throw new Error("The canvas is not ready to export.");
      if (format === "png") downloadPng(history.present, rect.width, rect.height, viewport);
      if (format === "svg") downloadText("touchcanvas.svg", createSvg(history.present, rect.width, rect.height, viewport), "image/svg+xml");
      if (format === "pdf") {
        const { downloadPdf } = await import("./drawing/pdf");
        downloadPdf(history.present, rect.width, rect.height, viewport);
      }
      setExportOpen(false);
      setNotice(`Exported ${format.toUpperCase()}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not export this sketch.");
    }
  };

  const saveSketchFile = () => {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    const name = `touchcanvas-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.touchcanvas`;
    downloadText(name, serializeSketch(history.present, tools, viewportRef.current), "application/json");
    setExportOpen(false);
    setNotice("Sketch file saved");
  };

  const openSketchFile = async (file: File) => {
    try {
      const sketch = parseSketch(await file.text());
      dispatchHistory({ type: "load", strokes: sketch.strokes });
      dispatchTools({ type: "set-tool", tool: sketch.tools.tool });
      dispatchTools({ type: "set-color", color: sketch.tools.color });
      dispatchTools({ type: "set-width", width: sketch.tools.width });
      dispatchTools({ type: "set-background", background: sketch.tools.background });
      dispatchTools({ type: "set-smart-shapes", enabled: sketch.tools.smartShapes });
      setViewport(sketch.viewport);
      setExportOpen(false);
      setNotice(`Opened ${file.name} with ${sketch.strokes.length} strokes`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not open that sketch file.");
    }
  };

  const insertTemplate = () => {
    const rect = paperRef.current?.getBoundingClientRect();
    const strokes = createWireframeTemplate();
    const mapped = rect && rect.width > 0 && rect.height > 0
      ? strokes.map((stroke) => ({
          ...stroke,
          points: stroke.points.map((point) => fractionPointToWorld(point.x, point.y, rect.width, rect.height, viewportRef.current)),
        }))
      : strokes;
    dispatchHistory({ type: "add-strokes", strokes: mapped });
    setTemplateOpen(false);
  };

  const zoomBy = (factor: number) => {
    const rect = paperRef.current?.getBoundingClientRect();
    if (rect) setViewport((current) => zoomAt(current, factor, rect.width / 2, rect.height / 2));
  };

  const backgroundSize = `${22 * viewport.zoom}px ${22 * viewport.zoom}px`;
  const backgroundPosition = `${viewport.panX}px ${viewport.panY}px`;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="TouchCanvas home">
          <span className="brand-mark"><span /></span>
          <span>touch<span className="brand-light">canvas</span></span>
        </a>
        <div className="document-title">
          <span className="status-dot" />
          <span>Untitled canvas</span>
          <span className="saved-label">{notice}</span>
        </div>
        <div className="top-actions">
          <button className="action-button pair-button" onClick={openPairing}>
            <Wifi size={16} /> Pair phone
            {pairStatus === "connected" && <span className="pair-live-dot" />}
          </button>
          <div className="menu-anchor">
            <button className="action-button" onClick={() => setExportOpen(!exportOpen)} aria-expanded={exportOpen}>
              <Download size={16} /> Export
            </button>
            {exportOpen && (
              <div className="popup-menu" role="menu">
                <button onClick={() => exportSketch("png")}>High-resolution PNG</button>
                <button onClick={() => exportSketch("svg")}>SVG vector</button>
                <button onClick={() => exportSketch("pdf")}>PDF document</button>
                <div className="menu-divider" role="separator" />
                <button onClick={saveSketchFile}>Save sketch file</button>
                <button onClick={() => { setExportOpen(false); sketchFileRef.current?.click(); }}>Open sketch file…</button>
              </div>
            )}
          </div>
          <button className="icon-button clear-button" onClick={clearCanvas} aria-label="Clear canvas" title="Clear canvas">
            <RotateCcw size={17} />
            <span>Clear</span>
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="tool-rail" aria-label="Drawing tools">
          <button className={`tool-button ${tools.tool === "pen" ? "selected" : ""}`} onClick={() => selectTool("pen")} aria-label="Pen tool" aria-pressed={tools.tool === "pen"} title="Pen">
            <span className="pen-icon">✎</span>
          </button>
          <button className={`tool-button ${tools.tool === "eraser" ? "selected" : ""}`} onClick={() => selectTool("eraser")} aria-label="Eraser tool" aria-pressed={tools.tool === "eraser"} title="Eraser">
            <Eraser size={19} />
          </button>
          <span className="rail-divider" />
          <button className="tool-button" onClick={() => dispatchHistory({ type: "undo" })} disabled={!canUndo(history)} aria-label="Undo" title="Undo">
            <Undo2 size={19} />
          </button>
          <button className="tool-button" onClick={() => dispatchHistory({ type: "redo" })} disabled={!canRedo(history)} aria-label="Redo" title="Redo">
            <Redo2 size={19} />
          </button>
          <span className="rail-divider" />
          <div className="menu-anchor">
            <button className={`tool-button ${templateOpen ? "selected" : ""}`} onClick={() => setTemplateOpen(!templateOpen)} aria-label="Insert template" title="Wireframe template">
              <Grid2X2 size={19} />
            </button>
            {templateOpen && <div className="template-popover"><strong>Starter templates</strong><button onClick={insertTemplate}>App wireframe</button></div>}
          </div>
          <div className="rail-spacer" />
          <span className="tool-hint">DRAW</span>
        </aside>

        <section className="canvas-area" aria-label="Sketch workspace">
          <div
            ref={paperRef}
            className={`canvas-paper background-${tools.background}`}
            style={{ backgroundSize, backgroundPosition }}
          >
            <DrawingCanvas
              history={history}
              tools={tools}
              viewport={viewport}
              onViewportChange={setViewport}
              remoteDraft={remoteDraft}
              onStrokeComplete={(stroke) => dispatchHistory({ type: "add-stroke", stroke: tools.smartShapes ? recognizeShape(stroke) : stroke })}
            />
            {history.present.length === 0 && !remoteDraft && (
              <div className="canvas-empty-state" aria-hidden="true">
                <span className="empty-icon"><span /></span>
                <span>Your canvas is ready</span>
                <small>Draw anywhere to get started</small>
              </div>
            )}
            <div className="zoom-controls" aria-label="Canvas zoom">
              <button onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom out"><ZoomOut size={15} /></button>
              <span>{Math.round(viewport.zoom * 100)}%</span>
              <button onClick={() => zoomBy(1.2)} aria-label="Zoom in"><ZoomIn size={15} /></button>
              <button onClick={() => setViewport(initialViewport)} aria-label="Reset canvas view">Reset</button>
            </div>
          </div>
          <div className="canvas-caption">
            <span><span className="keyboard-key">Ctrl</span> + <span className="keyboard-key">Z</span> to undo · pinch or scroll to zoom</span>
            <span className="canvas-dimensions">Infinite canvas · {history.present.length} strokes</span>
          </div>
        </section>

        <aside className="settings-panel" aria-label="Canvas settings">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">YOUR TOOLKIT</span>
              <h1>Make it yours</h1>
            </div>
            <span className="sparkle">✳</span>
          </div>

          <section className="setting-section">
            <div className="section-title-row"><h2>Stroke color</h2><span className="color-value">{tools.color.toUpperCase()}</span></div>
            <div className="swatches">
              {colors.map((color) => (
                <button key={color} className={`color-swatch ${tools.color === color ? "active" : ""}`} style={{ background: color, "--swatch-color": color } as React.CSSProperties} onClick={() => dispatchTools({ type: "set-color", color })} aria-label={`Set color ${color}`} aria-pressed={tools.color === color}>
                  {tools.color === color && <Check size={14} />}
                </button>
              ))}
              <label className="custom-color" title="Choose custom color">
                <input type="color" value={tools.color} onChange={(event) => dispatchTools({ type: "set-color", color: event.target.value })} aria-label="Custom stroke color" />
                <Plus size={19} />
              </label>
            </div>
          </section>

          <section className="setting-section width-section">
            <div className="section-title-row"><h2>Stroke width</h2><span className="width-value">{tools.width}<small> px</small></span></div>
            <div className="width-control">
              <Minus size={15} />
              <input type="range" min="1" max="28" value={tools.width} onChange={(event) => dispatchTools({ type: "set-width", width: Number(event.target.value) })} aria-label="Stroke width" />
              <Plus size={15} />
            </div>
            <div className="width-scale"><span>Fine</span><span>Bold</span></div>
          </section>

          <section className="setting-section background-section">
            <div className="section-title-row"><h2>Canvas background</h2></div>
            <div className="background-options" role="group" aria-label="Canvas background">
              {(["dots", "grid", "plain"] as CanvasBackground[]).map((background) => (
                <button key={background} className={`background-option ${tools.background === background ? "active" : ""}`} onClick={() => dispatchTools({ type: "set-background", background })} aria-pressed={tools.background === background} aria-label={`${background} background`}>
                  <span className={`background-preview preview-${background}`}>
                    {background === "grid" && <Grid2X2 size={14} />}
                    {background === "plain" && <span className="plain-preview" />}
                  </span>
                  <span>{background[0].toUpperCase() + background.slice(1)}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="setting-section smart-section">
            <div className="section-title-row">
              <h2>Smart shapes</h2>
              <button
                className={`toggle ${tools.smartShapes ? "on" : ""}`}
                role="switch"
                aria-checked={tools.smartShapes}
                onClick={() => dispatchTools({ type: "set-smart-shapes", enabled: !tools.smartShapes })}
                aria-label="Toggle smart shape recognition"
              >
                <span className="toggle-knob" />
              </button>
            </div>
            <p className="setting-note">Lines and closed loops snap to clean geometry. Turn off for raw freehand ink.</p>
          </section>

          <div className="tip-card"><span className="tip-icon">✦</span><p><strong>Smart ink</strong><br />Shape snapping can be turned off under Smart shapes. Two fingers pan and zoom.</p></div>
          <div className="panel-footer">
            <span className="live-dot" /> {pairStatus === "connected" ? "Phone connected" : "Ready to create"}
            <span className="footer-divider">·</span><span>{notice}</span>
          </div>
        </aside>
      </section>

      {pairOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setPairOpen(false)}>
          <section className="pair-modal" role="dialog" aria-modal="true" aria-labelledby="pair-title" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setPairOpen(false)} aria-label="Close pairing dialog"><X size={18} /></button>
            <span className="eyebrow">WIRELESS DRAWING PAD</span>
            <h2 id="pair-title">Connect your phone</h2>
            {pairing?.padUrls.length ? (
              <>
                <p>Make sure both devices are on the same Wi-Fi network, then scan this code with your phone camera.</p>
                <div className="qr-frame"><QRCodeSVG value={selectedPadUrl} size={200} level="M" /></div>
                <div className={`pairing-status ${pairStatus}`}>
                  <span className="status-dot" />{pairStatus === "connected" ? "Phone connected — draw on your phone" : pairStatus === "disconnected" ? "Phone disconnected" : "Waiting for your phone to connect"}
                </div>
                {pairing.padUrls.length > 1 && (
                  <div className="pair-addresses" role="group" aria-label="Choose a Wi-Fi address">
                    {(pairing.padTargets ?? pairing.padUrls.map((url) => ({ url, name: new URL(url).hostname, address: new URL(url).hostname }))).map((target) => (
                      <button key={target.url} className={selectedPadUrl === target.url ? "selected" : ""} onClick={() => setSelectedPadUrl(target.url)} title={target.address}>
                        {target.name}
                      </button>
                    ))}
                  </div>
                )}
                <p className="pair-url">{selectedPadUrl}</p>
                <small className="expiry-note">Pairing code expires in 30 minutes.</small>
              </>
            ) : (
              <p role="status">{notice || "No Wi-Fi address was found. Connect both devices to the same Wi-Fi network and try again."}</p>
            )}
          </section>
        </div>
      )}
      <input
        ref={sketchFileRef}
        type="file"
        accept=".touchcanvas,application/json"
        aria-hidden="true"
        tabIndex={-1}
        style={{ display: "none" }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void openSketchFile(file);
        }}
      />
    </main>
  );
}

export default App;
