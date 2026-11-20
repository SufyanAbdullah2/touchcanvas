import { describe, expect, it } from "vitest";
import { createSvg } from "./export";
import type { Stroke } from "./types";

describe("vector export", () => {
  it("creates a white-backed SVG with transformed vector paths", () => {
    const strokes: Stroke[] = [
      {
        points: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.6 }],
        color: "#123456",
        width: 3,
        tool: "pen",
        shape: "line",
      },
    ];
    const svg = createSvg(strokes, 200, 100, { zoom: 2, panX: 10, panY: 5 });
    expect(svg).toContain('viewBox="0 0 200 100"');
    expect(svg).toContain('fill="white"');
    expect(svg).toContain('stroke="#123456"');
    expect(svg).toContain("M 50 45 L 170 125");
  });

  it("masks erasers instead of painting white over the sketch", () => {
    const strokes: Stroke[] = [
      {
        points: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.6 }],
        color: "#123456",
        width: 3,
        tool: "pen",
        shape: "line",
      },
      {
        points: [{ x: 0.2, y: 0.3 }, { x: 0.3, y: 0.4 }],
        color: "#ffffff",
        width: 8,
        tool: "eraser",
      },
    ];
    const svg = createSvg(strokes, 200, 100, { zoom: 1, panX: 0, panY: 0 });
    expect(svg).toContain('<mask id="erase-0"');
    expect(svg).toContain('<g mask="url(#erase-0)">');
    expect(svg).toContain('stroke="#000000"');
    expect(svg).not.toContain('stroke="#ffffff"');
  });
});
