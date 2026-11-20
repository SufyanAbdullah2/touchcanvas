import { jsPDF } from "jspdf";
import { downloadBlob } from "./export";
import { drawStroke } from "./render";
import type { Stroke, Viewport } from "./types";

export function downloadPdf(strokes: Stroke[], width: number, height: number, viewport: Viewport): void {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * 2));
  canvas.height = Math.max(1, Math.round(height * 2));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create a PDF export canvas.");
  context.scale(2, 2);
  context.save();
  context.translate(viewport.panX, viewport.panY);
  context.scale(viewport.zoom, viewport.zoom);
  strokes.forEach((stroke) => drawStroke(context, stroke, width, height));
  context.restore();
  context.globalCompositeOperation = "destination-over";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  const pdf = new jsPDF({ orientation: width > height ? "landscape" : "portrait", unit: "px", format: [width, height] });
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, width, height);
  downloadBlob("touchcanvas.pdf", pdf.output("blob"), "application/pdf");
}
