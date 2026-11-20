export type DrawingTool = "pen" | "eraser";
export type CanvasBackground = "dots" | "grid" | "plain";

export interface Point {
  /** Position in canvas-width/canvas-height units, allowing the workspace to pan infinitely. */
  x: number;
  y: number;
  pressure?: number;
}

export interface Stroke {
  points: Point[];
  color: string;
  width: number;
  tool: DrawingTool;
  shape?: "line" | "rectangle" | "ellipse";
}

export interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
}

export interface RemoteStroke {
  id: string;
  stroke: Stroke;
}

export interface DrawingHistory {
  past: Stroke[][];
  present: Stroke[];
  future: Stroke[][];
}

export type HistoryAction =
  | { type: "add-stroke"; stroke: Stroke }
  | { type: "add-strokes"; strokes: Stroke[] }
  | { type: "load"; strokes: Stroke[] }
  | { type: "clear" }
  | { type: "undo" }
  | { type: "redo" };

export interface ToolState {
  tool: DrawingTool;
  color: string;
  width: number;
  background: CanvasBackground;
  smartShapes: boolean;
}

export type ToolAction =
  | { type: "set-tool"; tool: DrawingTool }
  | { type: "set-color"; color: string }
  | { type: "set-width"; width: number }
  | { type: "set-background"; background: CanvasBackground }
  | { type: "set-smart-shapes"; enabled: boolean };
