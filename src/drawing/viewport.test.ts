import { describe, expect, it } from "vitest";
import { fractionPointToWorld, toWorldPoint, zoomAt } from "./viewport";

describe("canvas viewport", () => {
  it("keeps the point beneath the cursor stationary while zooming", () => {
    const initial = { zoom: 1, panX: 12, panY: -8 };
    const zoomed = zoomAt(initial, 2, 100, 80);
    expect(zoomed.zoom).toBe(2);
    expect(100 - zoomed.panX).toBe((100 - initial.panX) * 2);
    expect(80 - zoomed.panY).toBe((80 - initial.panY) * 2);
  });

  it("maps screen coordinates back into the panned world", () => {
    expect(toWorldPoint(60, 40, 100, 80, { zoom: 2, panX: 20, panY: 8 })).toEqual({
      x: 0.2,
      y: 0.2,
      pressure: undefined,
    });
  });

  it("maps visible fractions into the world for template placement", () => {
    expect(fractionPointToWorld(0.5, 0.5, 200, 100, { zoom: 2, panX: 20, panY: 10 })).toEqual({
      x: 0.2,
      y: 0.2,
    });
  });
});
