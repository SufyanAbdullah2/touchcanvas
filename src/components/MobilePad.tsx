import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Eraser, RotateCcw, Wifi, WifiOff } from "lucide-react";
import { renderStrokes } from "../drawing/render";
import type { Point, Stroke } from "../drawing/types";

type PadSocket = ReturnType<typeof io>;
const backendUrl = (import.meta.env.VITE_TOUCHCANVAS_BACKEND_URL as string | undefined)?.replace(/\/$/, "");

export default function MobilePad() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef<number | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const strokeRef = useRef<Stroke | null>(null);
  const committedRef = useRef<Stroke[]>([]);
  const frameRef = useRef(0);
  const gestureRef = useRef<{ distance: number; x: number; y: number; startedAt: number; moved: number } | null>(null);
  const socketRef = useRef<PadSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [color, setColor] = useState("#28334a");
  const [width, setWidth] = useState(6);
  const [eraser, setEraser] = useState(false);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const pixelWidth = Math.max(1, Math.round(rect.width * ratio));
    const pixelHeight = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const strokes = strokeRef.current ? [...committedRef.current, strokeRef.current] : committedRef.current;
    renderStrokes(context, strokes, rect.width, rect.height);
  }, []);

  const scheduleRedraw = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      redraw();
    });
  }, [redraw]);

  useEffect(() => () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
  }, []);

  useEffect(() => {
    if (!token) {
      setError("This drawing-pad link is missing its pairing code. Scan the current desktop QR code again.");
      return;
    }
    const socket = io(backendUrl || undefined, { transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.on("connect", () => {
      socket.emit("pad:join", { token });
      setError("");
    });
    socket.on("pad:joined", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("pair:error", (message: string) => {
      setConnected(false);
      setError(message);
    });
    socket.on("pair:expired", () => {
      setConnected(false);
      setError("This pairing code expired. Create a new code on the desktop.");
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    redraw();
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => redraw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [redraw]);

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    const previousPressure = strokeRef.current?.points[strokeRef.current.points.length - 1]?.pressure;
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
      pressure: event.pointerType === "pen" ? (event.pressure > 0 ? event.pressure : previousPressure ?? 0.5) : 1,
    };
  };

  const commitStroke = (id: number | null) => {
    const stroke = strokeRef.current;
    if (!stroke) return;
    committedRef.current = [...committedRef.current, stroke];
    strokeRef.current = null;
    pointerRef.current = null;
    if (id !== null) socketRef.current?.emit("pad:stroke:end", { id: String(id) });
    scheduleRedraw();
  };

  const undo = () => {
    if (committedRef.current.length > 0) {
      committedRef.current = committedRef.current.slice(0, -1);
      scheduleRedraw();
    }
    socketRef.current?.emit("pad:undo");
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    pointersRef.current.set(event.pointerId, { x: event.clientX - rect.left, y: event.clientY - rect.top });
    if (pointersRef.current.size >= 2) {
      commitStroke(pointerRef.current);
      const points = [...pointersRef.current.values()];
      const first = points[0];
      const second = points[1];
      gestureRef.current = {
        distance: Math.hypot(second.x - first.x, second.y - first.y),
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
        startedAt: Date.now(),
        moved: 0,
      };
      return;
    }
    pointerRef.current = event.pointerId;
    const stroke: Stroke = {
      points: [getPoint(event)],
      color: eraser ? "#ffffff" : color,
      width: eraser ? Math.max(width * 3, 18) : width,
      tool: eraser ? "eraser" : "pen",
    };
    strokeRef.current = stroke;
    socketRef.current?.emit("pad:stroke:start", {
      id: String(event.pointerId),
      stroke,
      aspect: rect.width / Math.max(rect.height, 1),
    });
    scheduleRedraw();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const local = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    if (pointersRef.current.has(event.pointerId)) pointersRef.current.set(event.pointerId, local);

    if (gestureRef.current && pointersRef.current.size >= 2) {
      event.preventDefault();
      const points = [...pointersRef.current.values()];
      const first = points[0];
      const second = points[1];
      const centerX = (first.x + second.x) / 2;
      const centerY = (first.y + second.y) / 2;
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      const gesture = gestureRef.current;
      gesture.moved += Math.hypot(centerX - gesture.x, centerY - gesture.y) + Math.abs(distance - gesture.distance);
      socketRef.current?.emit("pad:viewport", {
        zoomFactor: distance / Math.max(gesture.distance, 1),
        deltaX: (centerX - gesture.x) / rect.width,
        deltaY: (centerY - gesture.y) / rect.height,
      });
      gesture.distance = distance;
      gesture.x = centerX;
      gesture.y = centerY;
      return;
    }

    if (pointerRef.current !== event.pointerId) return;
    event.preventDefault();
    const point = getPoint(event);
    const stroke = strokeRef.current;
    if (!stroke) return;
    stroke.points.push(point);
    socketRef.current?.emit("pad:stroke:point", { id: String(event.pointerId), point });
    scheduleRedraw();
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (gestureRef.current) {
      if (pointersRef.current.size < 2) {
        const gesture = gestureRef.current;
        gestureRef.current = null;
        if (Date.now() - gesture.startedAt < 300 && gesture.moved < 16) undo();
      }
      return;
    }
    if (pointerRef.current !== event.pointerId) return;
    commitStroke(event.pointerId);
  };

  const clearPad = () => {
    committedRef.current = [];
    strokeRef.current = null;
    pointerRef.current = null;
    redraw();
    socketRef.current?.emit("pad:clear");
  };

  return (
    <main className="mobile-pad">
      <header className="pad-toolbar">
        <a className="brand" href="/" aria-label="TouchCanvas home">
          <span className="brand-mark"><span /></span>
          <span>touch<span className="brand-light">canvas</span></span>
        </a>
        <span className={`pad-connection ${connected ? "connected" : ""}`}>
          {connected ? <Wifi size={15} /> : <WifiOff size={15} />}
          {connected ? "Paired" : "Connecting"}
        </span>
        <label className="pad-color" aria-label="Pen color">
          <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
        </label>
        <input
          className="pad-width"
          type="range"
          min="2"
          max="22"
          value={width}
          aria-label="Pen width"
          onChange={(event) => setWidth(Number(event.target.value))}
        />
        <button className={`pad-tool ${eraser ? "active" : ""}`} onClick={() => setEraser(!eraser)} aria-label="Toggle eraser">
          <Eraser size={18} />
        </button>
        <button className="pad-tool" onClick={undo} aria-label="Undo">
          <RotateCcw size={17} />
        </button>
      </header>
      <section className="pad-stage">
        <canvas
          ref={canvasRef}
          className="pad-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
        {error && <div className="pad-message" role="status">{error}</div>}
        {!connected && !error && <div className="pad-message" role="status">Connecting to your desktop…</div>}
      </section>
      <footer className="pad-footer">
        <span>One finger draws</span>
        <span>Two fingers pan and zoom</span>
        <span>Two-finger tap undoes</span>
        <button onClick={clearPad}>Clear desktop canvas</button>
      </footer>
    </main>
  );
}
