import type { DrawingHistory, HistoryAction, Stroke } from "./types";

export const initialHistory: DrawingHistory = {
  past: [],
  present: [],
  future: [],
};

export const historyLimit = 100;

function withSnapshot(past: Stroke[][], snapshot: Stroke[]): Stroke[][] {
  const next = [...past, snapshot];
  return next.length > historyLimit ? next.slice(next.length - historyLimit) : next;
}

export function historyReducer(state: DrawingHistory, action: HistoryAction): DrawingHistory {
  switch (action.type) {
    case "add-stroke":
      return {
        past: withSnapshot(state.past, state.present),
        present: [...state.present, action.stroke],
        future: [],
      };
    case "add-strokes":
      if (action.strokes.length === 0) return state;
      return {
        past: withSnapshot(state.past, state.present),
        present: [...state.present, ...action.strokes],
        future: [],
      };
    case "clear":
      if (state.present.length === 0) return state;
      return { past: withSnapshot(state.past, state.present), present: [], future: [] };
    case "load":
      return { past: withSnapshot(state.past, state.present), present: action.strokes, future: [] };
    case "undo": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      };
    }
    case "redo": {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        past: withSnapshot(state.past, state.present),
        present: next,
        future: state.future.slice(1),
      };
    }
  }
}

export const canUndo = (state: DrawingHistory) => state.past.length > 0;
export const canRedo = (state: DrawingHistory) => state.future.length > 0;

export function makeStroke(
  points: Stroke["points"],
  color: string,
  width: number,
  tool: Stroke["tool"],
): Stroke {
  return { points, color, width, tool };
}
