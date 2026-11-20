import type { Point, Viewport } from "./types";

export const initialViewport: Viewport = { zoom: 1, panX: 0, panY: 0 };

export function zoomAt(viewport: Viewport, factor: number, x: number, y: number): Viewport {
  const zoom = Math.min(5, Math.max(0.25, viewport.zoom * factor));
  const ratio = zoom / viewport.zoom;
  return {
    zoom,
    panX: x - (x - viewport.panX) * ratio,
    panY: y - (y - viewport.panY) * ratio,
  };
}

export function panBy(viewport: Viewport, deltaX: number, deltaY: number): Viewport {
  return { ...viewport, panX: viewport.panX + deltaX, panY: viewport.panY + deltaY };
}

/** Map a fraction of the visible canvas into world coordinates. */
export function fractionPointToWorld(
  x: number,
  y: number,
  width: number,
  height: number,
  viewport: Viewport,
): Point {
  return {
    x: (x * width - viewport.panX) / (viewport.zoom * width),
    y: (y * height - viewport.panY) / (viewport.zoom * height),
  };
}

export function toWorldPoint(
  x: number,
  y: number,
  width: number,
  height: number,
  viewport: Viewport,
  pressure?: number,
): Point {
  return {
    x: (x - viewport.panX) / (viewport.zoom * width),
    y: (y - viewport.panY) / (viewport.zoom * height),
    pressure,
  };
}
