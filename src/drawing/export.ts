import { drawStroke } from "./render";
import type { Stroke, Viewport } from "./types";

function strokePath(
  stroke: Stroke,
  width: number,
  height: number,
  viewport: Viewport,
  colorOverride?: string,
): string {
  const points = stroke.points.map((point) => ({
    x: point.x * width * viewport.zoom + viewport.panX,
    y: point.y * height * viewport.zoom + viewport.panY,
  }));
  if (points.length === 0) return "";
  const color = colorOverride ?? (stroke.tool === "eraser" ? "#ffffff" : stroke.color);
  const first = points[0];
  if (stroke.shape === "line" && points.length > 1) {
    return `<path d="M ${first.x} ${first.y} L ${points[points.length - 1].x} ${points[points.length - 1].y}" fill="none" stroke="${color}" stroke-width="${stroke.width * viewport.zoom}" stroke-linecap="round"/>`;
  }
  if (stroke.shape === "rectangle" && points.length > 1) {
    const last = points[points.length - 1];
    return `<rect x="${Math.min(first.x, last.x)}" y="${Math.min(first.y, last.y)}" width="${Math.abs(last.x - first.x)}" height="${Math.abs(last.y - first.y)}" fill="none" stroke="${color}" stroke-width="${stroke.width * viewport.zoom}"/>`;
  }
  if (stroke.shape === "ellipse" && points.length > 1) {
    const last = points[points.length - 1];
    const rx = Math.abs(last.x - first.x) / 2;
    const ry = Math.abs(last.y - first.y) / 2;
    return `<ellipse cx="${(first.x + last.x) / 2}" cy="${(first.y + last.y) / 2}" rx="${rx}" ry="${ry}" fill="none" stroke="${color}" stroke-width="${stroke.width * viewport.zoom}"/>`;
  }

  let path = `M ${first.x} ${first.y}`;
  if (points.length === 1) path += ` L ${first.x + 0.01} ${first.y + 0.01}`;
  if (points.length === 2) path += ` L ${points[1].x} ${points[1].y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    path += ` Q ${current.x} ${current.y} ${(current.x + next.x) / 2} ${(current.y + next.y) / 2}`;
  }
  if (points.length > 2) {
    const last = points[points.length - 1];
    path += ` Q ${last.x} ${last.y} ${last.x} ${last.y}`;
  }
  return `<path d="${path}" fill="none" stroke="${color}" stroke-width="${stroke.width * viewport.zoom}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function triggerDownload(href: string, filename: string): void {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function createSvg(
  strokes: Stroke[],
  width: number,
  height: number,
  viewport: Viewport,
): string {
  let body = "";
  const masks: string[] = [];
  for (const stroke of strokes) {
    if (stroke.tool === "eraser") {
      if (body === "") continue;
      const id = `erase-${masks.length}`;
      const erasePath = strokePath(stroke, width, height, viewport, "#000000");
      masks.push(
        `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}"><rect width="100%" height="100%" fill="white"/>${erasePath}</mask>`,
      );
      body = `<g mask="url(#${id})">${body}</g>`;
    } else {
      body += strokePath(stroke, width, height, viewport);
    }
  }
  const defs = masks.length > 0 ? `<defs>${masks.join("")}</defs>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${defs}<rect width="100%" height="100%" fill="white"/>${body}</svg>`;
}

export function downloadText(filename: string, text: string, type: string): void {
  downloadBlob(filename, new Blob([text], { type }));
}

export function downloadBlob(filename: string, blob: Blob, type?: string): void {
  const downloadBlob = type && blob.type !== type ? new Blob([blob], { type }) : blob;
  const url = URL.createObjectURL(downloadBlob);
  triggerDownload(url, filename);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadPng(strokes: Stroke[], width: number, height: number, viewport: Viewport): void {
  const canvas = document.createElement("canvas");
  const ratio = 2;
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(height * ratio));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create an image export canvas.");
  context.scale(ratio, ratio);
  context.save();
  context.translate(viewport.panX, viewport.panY);
  context.scale(viewport.zoom, viewport.zoom);
  strokes.forEach((stroke) => drawStroke(context, stroke, width, height));
  context.restore();
  context.globalCompositeOperation = "destination-over";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  triggerDownload(canvas.toDataURL("image/png"), "touchcanvas.png");
}
