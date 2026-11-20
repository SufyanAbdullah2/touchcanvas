import { describe, expect, it } from "vitest";
import { canRedo, canUndo, historyLimit, historyReducer, initialHistory } from "./history";
import { initialToolState, toolReducer } from "./tools";
import type { Stroke } from "./types";

const stroke = (x: number): Stroke => ({
  points: [{ x, y: 0.5 }, { x: x + 0.1, y: 0.6 }],
  color: "#123456",
  width: 4,
  tool: "pen",
});

describe("drawing history", () => {
  it("adds strokes and tracks availability of undo and redo", () => {
    const afterStroke = historyReducer(initialHistory, { type: "add-stroke", stroke: stroke(0.1) });
    expect(afterStroke.present).toHaveLength(1);
    expect(canUndo(afterStroke)).toBe(true);
    expect(canRedo(afterStroke)).toBe(false);
  });

  it("undoes and redoes changes in order", () => {
    let history = historyReducer(initialHistory, { type: "add-stroke", stroke: stroke(0.1) });
    history = historyReducer(history, { type: "add-stroke", stroke: stroke(0.3) });
    history = historyReducer(history, { type: "undo" });
    expect(history.present.map((item) => item.points[0].x)).toEqual([0.1]);
    expect(canRedo(history)).toBe(true);
    history = historyReducer(history, { type: "redo" });
    expect(history.present.map((item) => item.points[0].x)).toEqual([0.1, 0.3]);
    expect(canRedo(history)).toBe(false);
  });

  it("clears as an undoable action and drops redo after a new stroke", () => {
    let history = historyReducer(initialHistory, { type: "add-stroke", stroke: stroke(0.1) });
    history = historyReducer(history, { type: "clear" });
    expect(history.present).toHaveLength(0);
    history = historyReducer(history, { type: "undo" });
    expect(history.present).toHaveLength(1);
    history = historyReducer(history, { type: "undo" });
    history = historyReducer(history, { type: "add-stroke", stroke: stroke(0.7) });
    expect(canRedo(history)).toBe(false);
  });

  it("adds a template as one undoable history step", () => {
    const strokes = [stroke(0.1), stroke(0.3)];
    const afterAdd = historyReducer(initialHistory, { type: "add-strokes", strokes });
    expect(afterAdd.present).toHaveLength(2);
    expect(historyReducer(afterAdd, { type: "undo" }).present).toEqual([]);
  });

  it("loads a sketch file as one undoable history step", () => {
    let history = historyReducer(initialHistory, { type: "add-stroke", stroke: stroke(0.1) });
    history = historyReducer(history, { type: "load", strokes: [stroke(0.5), stroke(0.6)] });
    expect(history.present.map((item) => item.points[0].x)).toEqual([0.5, 0.6]);
    const undone = historyReducer(history, { type: "undo" });
    expect(undone.present.map((item) => item.points[0].x)).toEqual([0.1]);
  });

  it("caps undo snapshots so long sessions stay bounded", () => {
    let history = initialHistory;
    for (let index = 0; index < historyLimit + 10; index += 1) {
      history = historyReducer(history, { type: "add-stroke", stroke: stroke(index / 1000) });
    }
    expect(history.past.length).toBe(historyLimit);
    expect(history.present.length).toBe(historyLimit + 10);
  });
});

describe("tool settings", () => {
  it("changes tools and settings without mutating defaults", () => {
    const eraser = toolReducer(initialToolState, { type: "set-tool", tool: "eraser" });
    expect(eraser.tool).toBe("eraser");
    expect(initialToolState.tool).toBe("pen");
    const colored = toolReducer(eraser, { type: "set-color", color: "#ff0000" });
    const sized = toolReducer(colored, { type: "set-width", width: 12 });
    const gridded = toolReducer(sized, { type: "set-background", background: "grid" });
    expect(gridded).toMatchObject({ tool: "eraser", color: "#ff0000", width: 12, background: "grid" });
    const raw = toolReducer(gridded, { type: "set-smart-shapes", enabled: false });
    expect(raw.smartShapes).toBe(false);
    expect(initialToolState.smartShapes).toBe(true);
  });

  it("clamps stroke width to supported bounds", () => {
    expect(toolReducer(initialToolState, { type: "set-width", width: 100 }).width).toBe(28);
    expect(toolReducer(initialToolState, { type: "set-width", width: 0 }).width).toBe(1);
  });
});
