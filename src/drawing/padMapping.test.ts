import { describe, expect, it } from "vitest";
import { createPadFrame, mapPadPoint } from "./padMapping";

describe("phone pad mapping", () => {
  it("letterboxes a square pad into a wide canvas without stretching", () => {
    const frame = createPadFrame({ zoom: 1, panX: 0, panY: 0 }, 300, 100, 1);
    const topLeft = mapPadPoint({ x: 0, y: 0 }, frame);
    const topRight = mapPadPoint({ x: 1, y: 0 }, frame);
    const bottomRight = mapPadPoint({ x: 1, y: 1 }, frame);
    expect(topLeft.x).toBeCloseTo(1 / 3);
    expect(topLeft.y).toBeCloseTo(0);
    expect(topRight.x - topLeft.x).toBeCloseTo(1 / 3);
    expect(bottomRight.y - topRight.y).toBeCloseTo(1);
  });

  it("maps pad fractions through the desktop viewport", () => {
    const frame = createPadFrame({ zoom: 2, panX: 20, panY: 10 }, 200, 200, 1);
    expect(mapPadPoint({ x: 0, y: 0 }, frame)).toMatchObject({ x: -0.05, y: -0.025 });
  });

  it("clamps absurd aspect ratios and falls back when missing", () => {
    expect(createPadFrame({ zoom: 1, panX: 0, panY: 0 }, 320, 200, 100).aspect).toBe(5);
    expect(createPadFrame({ zoom: 1, panX: 0, panY: 0 }, 320, 200, Number.NaN).aspect).toBeCloseTo(1.6);
  });
});
