import { describe, expect, it } from "vitest";
import { recognizeShape } from "./shapes";
import type { Stroke } from "./types";

const base: Stroke = { points: [], color: "#28334a", width: 3, tool: "pen" };

describe("smart shape recognition", () => {
  it("converts a nearly straight path into a line", () => {
    const result = recognizeShape({
      ...base,
      points: [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.3 }, { x: 0.7, y: 0.5 }, { x: 0.9, y: 0.633 }],
    });
    expect(result.shape).toBe("line");
    expect(result.points).toHaveLength(2);
  });

  it("distinguishes a closed rectangular path from a rounded path", () => {
    const rectangle = recognizeShape({
      ...base,
      points: [
        { x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.9, y: 0.1 },
        { x: 0.9, y: 0.5 }, { x: 0.9, y: 0.9 }, { x: 0.5, y: 0.9 },
        { x: 0.1, y: 0.9 }, { x: 0.1, y: 0.5 }, { x: 0.1, y: 0.1 },
      ],
    });
    const ellipse = recognizeShape({
      ...base,
      points: Array.from({ length: 17 }, (_, index) => {
        const angle = (index / 16) * Math.PI * 2;
        return { x: 0.5 + Math.cos(angle) * 0.4, y: 0.5 + Math.sin(angle) * 0.3 };
      }),
    });
    expect(rectangle.shape).toBe("rectangle");
    expect(ellipse.shape).toBe("ellipse");
  });

  it("does not convert eraser strokes into shapes", () => {
    const result = recognizeShape({ ...base, tool: "eraser", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
    expect(result.shape).toBeUndefined();
  });
});
