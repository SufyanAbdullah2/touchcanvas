import type { Point, Viewport } from "./types";

export interface PadFrame {
  viewport: Viewport;
  width: number;
  height: number;
  aspect: number;
}

const minAspect = 0.2;
const maxAspect = 5;

export function createPadFrame(viewport: Viewport, width: number, height: number, aspect: number): PadFrame {
  const fallback = width > 0 && height > 0 ? width / height : 1;
  const safeAspect = Number.isFinite(aspect) && aspect > 0
    ? Math.min(maxAspect, Math.max(minAspect, aspect))
    : fallback;
  return { viewport: { ...viewport }, width, height, aspect: safeAspect };
}

/** Map a phone-pad fraction onto the desktop canvas without stretching the sketch. */
export function mapPadPoint(point: Point, frame: PadFrame): Point {
  const { viewport, width, height, aspect } = frame;
  if (width <= 0 || height <= 0) return { ...point };
  const wider = width / height > aspect;
  const regionWidth = wider ? height * aspect : width;
  const regionHeight = wider ? height : width / aspect;
  const screenX = (width - regionWidth) / 2 + point.x * regionWidth;
  const screenY = (height - regionHeight) / 2 + point.y * regionHeight;
  return {
    x: (screenX - viewport.panX) / (viewport.zoom * width),
    y: (screenY - viewport.panY) / (viewport.zoom * height),
    pressure: point.pressure,
  };
}
