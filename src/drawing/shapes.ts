import type { Stroke } from "./types";

export function recognizeShape(stroke: Stroke): Stroke {
  const { points } = stroke;
  if (stroke.tool !== "pen" || points.length < 2) return stroke;

  const first = points[0];
  const last = points[points.length - 1];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;
  const diagonal = Math.hypot(width, height);
  if (diagonal < 0.005) return stroke;

  const lineError = points.reduce((maximum, point) => {
    const distance = Math.abs(
      (last.y - first.y) * point.x -
      (last.x - first.x) * point.y +
      last.x * first.y -
      last.y * first.x,
    ) / Math.max(Math.hypot(last.y - first.y, last.x - first.x), 0.0001);
    return Math.max(maximum, distance);
  }, 0);

  const endpointDistance = Math.hypot(last.x - first.x, last.y - first.y);
  if (endpointDistance >= diagonal * 0.5 && lineError <= diagonal * 0.025) {
    return { ...stroke, shape: "line", points: [first, last] };
  }

  const closed = Math.hypot(last.x - first.x, last.y - first.y) <= diagonal * 0.2;
  if (!closed || width < 0.01 || height < 0.01) return stroke;

  const corners = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
  const cornerCount = corners.filter((corner) => points.some(
    (point) => Math.hypot(point.x - corner.x, point.y - corner.y) <= diagonal * 0.1,
  )).length;
  const rectangularity = points.length >= 6 && cornerCount >= 3 && width / height > 0.15 && height / width > 0.15;
  return {
    ...stroke,
    shape: rectangularity ? "rectangle" : "ellipse",
    points: [{ x: minX, y: minY }, { x: maxX, y: maxY }],
  };
}
