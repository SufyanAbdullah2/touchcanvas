import type { Stroke } from "./types";

export function createWireframeTemplate(): Stroke[] {
  const line = (x1: number, y1: number, x2: number, y2: number): Stroke => ({
    points: [{ x: x1, y: y1 }, { x: x2, y: y2 }],
    color: "#a9b1c2",
    width: 2,
    tool: "pen",
    shape: "line",
  });
  const rectangle = (x1: number, y1: number, x2: number, y2: number): Stroke => ({
    points: [{ x: x1, y: y1 }, { x: x2, y: y2 }],
    color: "#a9b1c2",
    width: 2,
    tool: "pen",
    shape: "rectangle",
  });

  return [
    rectangle(0.14, 0.12, 0.86, 0.88),
    rectangle(0.14, 0.12, 0.86, 0.23),
    rectangle(0.18, 0.15, 0.28, 0.20),
    line(0.73, 0.175, 0.82, 0.175),
    rectangle(0.18, 0.28, 0.36, 0.82),
    rectangle(0.40, 0.28, 0.82, 0.54),
    rectangle(0.40, 0.59, 0.60, 0.82),
    rectangle(0.63, 0.59, 0.82, 0.82),
    line(0.42, 0.35, 0.75, 0.35),
    line(0.42, 0.40, 0.68, 0.40),
    line(0.20, 0.34, 0.33, 0.34),
    line(0.20, 0.40, 0.31, 0.40),
  ];
}
