import { describe, expect, it, vi } from "vitest";
import { drawStroke, renderStrokes } from "./render";
import type { Stroke } from "./types";

function createContext() {
  const context = {
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    rect: vi.fn(),
    ellipse: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    stroke: vi.fn(),
    globalCompositeOperation: "source-over",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
  };
  return context as unknown as CanvasRenderingContext2D;
}

const sampleStroke: Stroke = {
  points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }, { x: 0.5, y: 0.6 }],
  color: "#123456",
  width: 7,
  tool: "pen",
};

describe("canvas rendering", () => {
  it("uses normalized samples to render a smoothed quadratic stroke", () => {
    const context = createContext();
    drawStroke(context, sampleStroke, 200, 100);
    expect(context.moveTo).toHaveBeenCalledWith(20, 20);
    expect(context.quadraticCurveTo).toHaveBeenCalled();
    expect(context.strokeStyle).toBe("#123456");
    expect(context.lineWidth).toBe(7);
  });

  it("clears the old canvas state before replaying strokes", () => {
    const context = createContext();
    renderStrokes(context, [sampleStroke], 200, 100);
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 200, 100);
    expect(context.stroke).toHaveBeenCalledOnce();
  });

  it("renders recognized vector shapes with their geometry", () => {
    const context = createContext();
    drawStroke(context, { ...sampleStroke, shape: "rectangle", points: [{ x: 0.1, y: 0.2 }, { x: 0.5, y: 0.6 }] }, 200, 100);
    expect(context.rect).toHaveBeenCalledWith(20, 20, 80, 40);
  });

  it("uses pressure samples to vary stroke width", () => {
    const context = createContext();
    drawStroke(context, {
      ...sampleStroke,
      width: 8,
      points: [{ x: 0.1, y: 0.2, pressure: 0.2 }, { x: 0.5, y: 0.6, pressure: 0.8 }],
    }, 200, 100);
    expect(context.lineWidth).toBe(4);
    expect(context.stroke).toHaveBeenCalledOnce();
  });
});
