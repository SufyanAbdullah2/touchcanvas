import type { CanvasBackground, DrawingTool, Point, Stroke, ToolState, Viewport } from "./types";

export const sketchFileApp = "touchcanvas";
export const sketchFileVersion = 1;
export const maxFileStrokes = 5000;
export const maxFilePoints = 20000;

export interface SketchFile {
  app: typeof sketchFileApp;
  version: number;
  savedAt: string;
  tools: ToolState;
  viewport: Viewport;
  strokes: Stroke[];
}

const hexColor = /^#[\da-f]{6}$/i;
const tools: DrawingTool[] = ["pen", "eraser"];
const backgrounds: CanvasBackground[] = ["dots", "grid", "plain"];
const shapes: Stroke["shape"][] = ["line", "rectangle", "ellipse"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parsePoint(value: unknown): Point | null {
  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y)) return null;
  const pressure = value.pressure;
  if (pressure !== undefined && (!isFiniteNumber(pressure) || pressure < 0 || pressure > 1)) return null;
  return pressure === undefined ? { x: value.x, y: value.y } : { x: value.x, y: value.y, pressure };
}

function parseStroke(value: unknown): Stroke | null {
  if (!isRecord(value)) return null;
  if (!hexColor.test(typeof value.color === "string" ? value.color : "")) return null;
  if (!isFiniteNumber(value.width) || value.width < 1 || value.width > 100) return null;
  if (!tools.includes(value.tool as DrawingTool)) return null;
  if (value.shape !== undefined && !shapes.includes(value.shape as Stroke["shape"])) return null;
  if (!Array.isArray(value.points) || value.points.length === 0 || value.points.length > maxFilePoints) return null;
  const points: Point[] = [];
  for (const entry of value.points) {
    const point = parsePoint(entry);
    if (!point) return null;
    points.push(point);
  }
  const stroke: Stroke = { points, color: value.color as string, width: value.width, tool: value.tool as DrawingTool };
  if (value.shape !== undefined) stroke.shape = value.shape as Stroke["shape"];
  return stroke;
}

function parseTools(value: unknown): ToolState | null {
  if (!isRecord(value)) return null;
  if (!tools.includes(value.tool as DrawingTool)) return null;
  if (!hexColor.test(typeof value.color === "string" ? value.color : "")) return null;
  if (!isFiniteNumber(value.width)) return null;
  if (!backgrounds.includes(value.background as CanvasBackground)) return null;
  if (value.smartShapes !== undefined && typeof value.smartShapes !== "boolean") return null;
  return {
    tool: value.tool as DrawingTool,
    color: value.color as string,
    width: Math.min(28, Math.max(1, value.width)),
    background: value.background as CanvasBackground,
    smartShapes: typeof value.smartShapes === "boolean" ? value.smartShapes : true,
  };
}

function parseViewport(value: unknown): Viewport | null {
  if (!isRecord(value)) return null;
  if (!isFiniteNumber(value.zoom) || !isFiniteNumber(value.panX) || !isFiniteNumber(value.panY)) return null;
  return { zoom: Math.min(5, Math.max(0.25, value.zoom)), panX: value.panX, panY: value.panY };
}

export function serializeSketch(strokes: Stroke[], toolState: ToolState, viewport: Viewport): string {
  const file: SketchFile = {
    app: sketchFileApp,
    version: sketchFileVersion,
    savedAt: new Date().toISOString(),
    tools: toolState,
    viewport,
    strokes,
  };
  return JSON.stringify(file);
}

export function parseSketch(text: string): SketchFile {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  if (!isRecord(value) || value.app !== sketchFileApp) {
    throw new Error("That file is not a TouchCanvas sketch.");
  }
  if (value.version !== sketchFileVersion) {
    throw new Error(`Unsupported sketch file version ${String(value.version)}.`);
  }
  if (!Array.isArray(value.strokes)) {
    throw new Error("The sketch file is missing its stroke list.");
  }
  if (value.strokes.length > maxFileStrokes) {
    throw new Error("The sketch file contains too many strokes to open.");
  }
  const strokes: Stroke[] = [];
  for (const entry of value.strokes) {
    const stroke = parseStroke(entry);
    if (!stroke) throw new Error("The sketch file contains an invalid stroke.");
    strokes.push(stroke);
  }
  const parsedTools = parseTools(value.tools);
  if (!parsedTools) throw new Error("The sketch file has invalid tool settings.");
  const parsedViewport = parseViewport(value.viewport);
  if (!parsedViewport) throw new Error("The sketch file has an invalid canvas view.");
  return {
    app: sketchFileApp,
    version: sketchFileVersion,
    savedAt: typeof value.savedAt === "string" ? value.savedAt : "",
    tools: parsedTools,
    viewport: parsedViewport,
    strokes,
  };
}
