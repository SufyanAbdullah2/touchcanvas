import { useCallback, useEffect, useRef, useState } from "react";
import { drawStroke, renderStrokes } from "../drawing/render";
import { panBy, toWorldPoint, zoomAt } from "../drawing/viewport";
import type { DrawingHistory, Point, RemoteStroke, Stroke, ToolState, Viewport } from "../drawing/types";

interface DrawingCanvasProps {
  history: DrawingHistory;
  tools: ToolState;
  viewport: Viewport;
  onViewportChange: (viewport: Viewport) => void;
  remoteDraft: RemoteStroke | null;
  onStrokeComplete: (stroke: Stroke) => void;
}

export default function DrawingCanvas({
  history,
  tools,
  viewport,
  onViewportChange,
  remoteDraft,
  onStrokeComplete,
}: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const activeStrokeRef = useRef<Point[]>([]);
  const activeStyleRef = useRef<Omit<Stroke, "points"> | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number; type: string }>());
  const gestureRef = useRef<{
    viewport: Viewport;
    distance: number;
    centerX: number;
    centerY: number;
  } | null>(null);
  const panPointerRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<Stroke | null>(null);
  const cacheRef = useRef<HTMLCanvasElement | null>(null);
  const cacheKeyRef = useRef<{ strokes: Stroke[]; viewport: Viewport } | null>(null);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const ratio = window.devicePixelRatio || 1;
    const pixelWidth = Math.max(1, Math.round(rect.width * ratio));
    const pixelHeight = Math.max(1, Math.round(rect.height * ratio));

    let cache = cacheRef.current;
    if (!cache) {
      cache = document.createElement("canvas");
      cacheRef.current = cache;
    }
    const key = cacheKeyRef.current;
    const cacheStale =
      !key ||
      key.strokes !== history.present ||
      key.viewport !== viewport ||
      cache.width !== pixelWidth ||
      cache.height !== pixelHeight;
    if (cacheStale) {
      cache.width = pixelWidth;
      cache.height = pixelHeight;
      const cacheContext = cache.getContext("2d");
      if (!cacheContext) return;
      cacheContext.setTransform(ratio, 0, 0, ratio, 0, 0);
      renderStrokes(cacheContext, history.present, rect.width, rect.height, viewport);
      cacheKeyRef.current = { strokes: history.present, viewport };
    }

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, pixelWidth, pixelHeight);
    context.drawImage(cache, 0, 0);

    const drafts = [...(remoteDraft ? [remoteDraft.stroke] : []), ...(draft ? [draft] : [])];
    if (drafts.length > 0) {
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.save();
      context.translate(viewport.panX, viewport.panY);
      context.scale(viewport.zoom, viewport.zoom);
      drafts.forEach((stroke) => drawStroke(context, stroke, rect.width, rect.height));
      context.restore();
    }
  }, [history.present, viewport, remoteDraft, draft]);

  useEffect(() => {
    paint();
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(paint);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [paint]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      onViewportChangeRef.current(zoomAt(
        viewportRef.current,
        Math.exp(-event.deltaY * 0.001),
        event.clientX - rect.left,
        event.clientY - rect.top,
      ));
    };
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, []);

  const getLocalPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    const previousPressure = activeStrokeRef.current[activeStrokeRef.current.length - 1]?.pressure;
    return toWorldPoint(
      event.clientX - rect.left,
      event.clientY - rect.top,
      rect.width,
      rect.height,
      viewport,
      event.pointerType === "pen" ? (event.pressure > 0 ? event.pressure : previousPressure ?? 0.5) : 1,
    );
  };

  const updateDraft = (points: Point[]) => {
    const style = activeStyleRef.current;
    if (style) setDraft({ points, ...style });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const local = getLocalPoint(event);
    pointersRef.current.set(event.pointerId, { ...local, type: event.pointerType });
    if (event.pointerType === "touch" && pointersRef.current.size >= 2) {
      activeStrokeRef.current = [];
      activeStyleRef.current = null;
      pointerIdRef.current = null;
      panPointerRef.current = null;
      setDraft(null);
      const points = [...pointersRef.current.values()].filter((point) => point.type === "touch");
      const first = points[0];
      const second = points[1];
      gestureRef.current = {
        viewport,
        distance: Math.hypot(second.x - first.x, second.y - first.y),
        centerX: (first.x + second.x) / 2,
        centerY: (first.y + second.y) / 2,
      };
      return;
    }
    if (pointerIdRef.current !== null) return;
    if (event.button === 1) {
      panPointerRef.current = { id: event.pointerId, ...local };
      return;
    }
    pointerIdRef.current = event.pointerId;
    activeStyleRef.current = { color: tools.color, width: tools.width, tool: tools.tool };
    activeStrokeRef.current = [getPoint(event)];
    updateDraft(activeStrokeRef.current);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const local = getLocalPoint(event);
    const existing = pointersRef.current.get(event.pointerId);
    if (existing) pointersRef.current.set(event.pointerId, { ...local, type: existing.type });
    if (gestureRef.current && pointersRef.current.size >= 2) {
      const points = [...pointersRef.current.values()].filter((point) => point.type === "touch");
      if (points.length >= 2) {
        const [first, second] = points;
        const centerX = (first.x + second.x) / 2;
        const centerY = (first.y + second.y) / 2;
        const distance = Math.hypot(second.x - first.x, second.y - first.y);
        const start = gestureRef.current;
        const zoomed = zoomAt(start.viewport, distance / Math.max(start.distance, 1), start.centerX, start.centerY);
        onViewportChange(panBy(zoomed, centerX - start.centerX, centerY - start.centerY));
      }
      event.preventDefault();
      return;
    }
    if (panPointerRef.current?.id === event.pointerId) {
      onViewportChange(panBy(viewport, local.x - panPointerRef.current.x, local.y - panPointerRef.current.y));
      panPointerRef.current = { id: event.pointerId, ...local };
      event.preventDefault();
      return;
    }
    if (pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    activeStrokeRef.current = [...activeStrokeRef.current, getPoint(event)];
    updateDraft(activeStrokeRef.current);
  };

  const finishStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (gestureRef.current) {
      if (pointersRef.current.size < 2) gestureRef.current = null;
      return;
    }
    if (panPointerRef.current?.id === event.pointerId) {
      panPointerRef.current = null;
      return;
    }
    if (pointerIdRef.current !== event.pointerId) return;
    const points = [...activeStrokeRef.current, getPoint(event)];
    const style = activeStyleRef.current;
    if (style) onStrokeComplete({ points, ...style });
    activeStrokeRef.current = [];
    activeStyleRef.current = null;
    pointerIdRef.current = null;
    setDraft(null);
  };

  const cancelStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (gestureRef.current) {
      if (pointersRef.current.size < 2) gestureRef.current = null;
      return;
    }
    if (panPointerRef.current?.id === event.pointerId) {
      panPointerRef.current = null;
      return;
    }
    if (pointerIdRef.current !== event.pointerId) return;
    activeStrokeRef.current = [];
    activeStyleRef.current = null;
    pointerIdRef.current = null;
    setDraft(null);
  };

  return (
    <canvas
      ref={canvasRef}
      className="drawing-canvas"
      aria-label="Drawing canvas"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishStroke}
      onPointerCancel={cancelStroke}
      onLostPointerCapture={cancelStroke}
    />
  );
}
