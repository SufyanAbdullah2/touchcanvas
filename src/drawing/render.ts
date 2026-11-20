import type { Point, Stroke, Viewport } from "./types";

function toCanvasPoint(point: Point, width: number, height: number) {
  return { x: point.x * width, y: point.y * height, pressure: point.pressure };
}

/** Draw a stabilized stroke by using each sample as a quadratic control point. */
export function drawStroke(
  context: CanvasRenderingContext2D,
  stroke: Stroke,
  width: number,
  height: number,
) {
  if (stroke.points.length === 0) return;

  const points = stroke.points.map((point) => toCanvasPoint(point, width, height));
  context.save();
  context.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
  context.strokeStyle = stroke.color;
  context.lineCap = "round";
  context.lineJoin = "round";

  if (stroke.shape) {
    context.lineWidth = stroke.width;
    const first = points[0];
    const last = points[points.length - 1];
    context.beginPath();
    if (stroke.shape === "line") {
      context.moveTo(first.x, first.y);
      context.lineTo(last.x, last.y);
    } else {
      const left = Math.min(first.x, last.x);
      const top = Math.min(first.y, last.y);
      const shapeWidth = Math.abs(last.x - first.x);
      const shapeHeight = Math.abs(last.y - first.y);
      if (stroke.shape === "rectangle") {
        context.rect(left, top, shapeWidth, shapeHeight);
      } else {
        context.ellipse(
          left + shapeWidth / 2,
          top + shapeHeight / 2,
          Math.max(shapeWidth / 2, 0.5),
          Math.max(shapeHeight / 2, 0.5),
          0,
          0,
          Math.PI * 2,
        );
      }
    }
    context.stroke();
    context.restore();
    return;
  }

  if (points.some((point) => point.pressure !== undefined)) {
    if (points.length === 1) {
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      context.lineTo(points[0].x + 0.01, points[0].y + 0.01);
      context.lineWidth = stroke.width * (stroke.points[0].pressure ?? 1);
      context.stroke();
    } else {
      for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1];
        const current = points[index];
        const next = points[index + 1] ?? current;
        const start = index === 1
          ? previous
          : { x: (previous.x + current.x) / 2, y: (previous.y + current.y) / 2 };
        const end = index === points.length - 1
          ? current
          : { x: (current.x + next.x) / 2, y: (current.y + next.y) / 2 };
        const pressure = ((stroke.points[index - 1].pressure ?? 1) + (stroke.points[index].pressure ?? 1)) / 2;
        context.beginPath();
        context.moveTo(start.x, start.y);
        if (points.length === 2) context.lineTo(end.x, end.y);
        else context.quadraticCurveTo(current.x, current.y, end.x, end.y);
        context.lineWidth = stroke.width * Math.max(0.15, Math.min(1, pressure));
        context.stroke();
      }
    }
  } else {
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    if (points.length === 1) {
      context.lineTo(points[0].x + 0.01, points[0].y + 0.01);
    } else if (points.length === 2) {
      context.lineTo(points[1].x, points[1].y);
    } else {
      for (let index = 1; index < points.length - 1; index += 1) {
        const current = points[index];
        const next = points[index + 1];
        const midpoint = { x: (current.x + next.x) / 2, y: (current.y + next.y) / 2 };
        context.quadraticCurveTo(current.x, current.y, midpoint.x, midpoint.y);
      }
      const last = points[points.length - 1];
      context.quadraticCurveTo(last.x, last.y, last.x, last.y);
    }
    context.lineWidth = stroke.width;
    context.stroke();
  }
  context.restore();
}

export function renderStrokes(
  context: CanvasRenderingContext2D,
  strokes: Stroke[],
  width: number,
  height: number,
  viewport: Viewport = { zoom: 1, panX: 0, panY: 0 },
) {
  context.clearRect(0, 0, width, height);
  context.save();
  context.translate(viewport.panX, viewport.panY);
  context.scale(viewport.zoom, viewport.zoom);
  strokes.forEach((stroke) => drawStroke(context, stroke, width, height));
  context.restore();
}
