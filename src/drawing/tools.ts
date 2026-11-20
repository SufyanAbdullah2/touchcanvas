import type { ToolAction, ToolState } from "./types";

export const initialToolState: ToolState = {
  tool: "pen",
  color: "#28334a",
  width: 5,
  background: "dots",
  smartShapes: true,
};

export function toolReducer(state: ToolState, action: ToolAction): ToolState {
  switch (action.type) {
    case "set-tool":
      return { ...state, tool: action.tool };
    case "set-color":
      return { ...state, color: action.color };
    case "set-width":
      return { ...state, width: Math.min(28, Math.max(1, action.width)) };
    case "set-background":
      return { ...state, background: action.background };
    case "set-smart-shapes":
      return { ...state, smartShapes: action.enabled };
  }
}
