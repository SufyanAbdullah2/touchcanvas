import { describe, expect, it } from "vitest";
import { initialToolState } from "./tools";
import { initialViewport } from "./viewport";
import { parseSketch, serializeSketch, sketchFileApp, sketchFileVersion } from "./sketchFile";
import type { Stroke } from "./types";

const stroke: Stroke = {
  points: [{ x: 0.2, y: 0.3 }, { x: 0.4, y: 0.5, pressure: 0.8 }],
  color: "#28334a",
  width: 6,
  tool: "pen",
  shape: "line",
};

describe("sketch files", () => {
  it("round-trips strokes, tools, and viewport", () => {
    const text = serializeSketch([stroke], { ...initialToolState, width: 9 }, { zoom: 2, panX: 40, panY: -12 });
    const parsed = parseSketch(text);
    expect(parsed.app).toBe(sketchFileApp);
    expect(parsed.version).toBe(sketchFileVersion);
    expect(parsed.strokes).toEqual([stroke]);
    expect(parsed.tools.width).toBe(9);
    expect(parsed.viewport).toEqual({ zoom: 2, panX: 40, panY: -12 });
  });

  it("rejects files that are not TouchCanvas sketches", () => {
    expect(() => parseSketch("not json")).toThrow(/not valid JSON/);
    expect(() => parseSketch(JSON.stringify({ app: "other", version: 1, strokes: [] }))).toThrow(/not a TouchCanvas sketch/);
    expect(() => parseSketch(JSON.stringify({ app: sketchFileApp, version: 99, strokes: [] }))).toThrow(/version/);
  });

  it("rejects malformed strokes and settings", () => {
    const base = { app: sketchFileApp, version: sketchFileVersion, tools: initialToolState, viewport: initialViewport };
    const bad = (strokes: unknown) => JSON.stringify({ ...base, strokes });
    expect(() => parseSketch(bad("nope"))).toThrow(/missing its stroke list/);
    expect(() => parseSketch(bad([{ ...stroke, color: "red" }]))).toThrow(/invalid stroke/);
    expect(() => parseSketch(bad([{ ...stroke, width: 0 }]))).toThrow(/invalid stroke/);
    expect(() => parseSketch(bad([{ ...stroke, points: [] }]))).toThrow(/invalid stroke/);
    expect(() => parseSketch(bad([{ ...stroke, points: [{ x: 1, y: NaN }] }]))).toThrow(/invalid stroke/);
    expect(() => parseSketch(JSON.stringify({ ...base, strokes: [], tools: { ...initialToolState, tool: "spray" } }))).toThrow(/tool settings/);
    expect(() => parseSketch(JSON.stringify({ ...base, strokes: [], viewport: { zoom: 1, panX: 1 } }))).toThrow(/canvas view/);
  });

  it("clamps tool width and viewport zoom from files", () => {
    const base = { app: sketchFileApp, version: sketchFileVersion, strokes: [] };
    const parsed = parseSketch(JSON.stringify({
      ...base,
      tools: { ...initialToolState, width: 40 },
      viewport: { zoom: 40, panX: 0, panY: 0 },
    }));
    expect(parsed.tools.width).toBe(28);
    expect(parsed.viewport.zoom).toBe(5);
  });
});
