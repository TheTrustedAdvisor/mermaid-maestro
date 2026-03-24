import { Notice, Platform } from "obsidian";
import { getSvgDimensions } from "../../utils/svg-utils";
import { rasterizeSvgToCanvas, releaseCanvas } from "../../utils/render-utils";

/**
 * Export an SVG as PDF to the clipboard (macOS) or offer download as fallback.
 * Uses jsPDF to generate the PDF from a canvas rendering of the SVG.
 */
export async function exportPdf(svg: SVGSVGElement, scale: number): Promise<void> {
	try {
		// Dynamic import to keep initial bundle small
		const { jsPDF } = await import("jspdf");

		const dims = getSvgDimensions(svg);
		const canvas = await rasterizeSvgToCanvas(svg, scale, "white");

		// Convert canvas to PNG data URL for jsPDF
		const imgData = canvas.toDataURL("image/png", 1.0);

		// Create PDF with dimensions matching the diagram
		const orientation = dims.width > dims.height ? "landscape" : "portrait";
		const pdf = new jsPDF({
			orientation,
			unit: "px",
			format: [dims.width, dims.height],
		});

		pdf.addImage(imgData, "PNG", 0, 0, dims.width, dims.height);

		// Release canvas memory
		releaseCanvas(canvas);

		// Try to copy to clipboard (works on macOS via Electron)
		const pdfBlob = pdf.output("blob");
		const copied = await tryClipboardPdf(pdfBlob);

		if (copied) {
			new Notice("PDF copied to clipboard!");
		} else {
			// Fallback: trigger download
			pdf.save("mermaid-diagram.pdf");
			new Notice("PDF saved as file (clipboard not supported on this platform).");
		}
	} catch (err) {
		console.error("Mermaid Maestro: PDF export failed", err);
		new Notice(`PDF export failed: ${err instanceof Error ? err.message : "Unknown error"}`);
	}
}

/**
 * Try to write PDF blob to clipboard.
 * This works on macOS via Electron's native clipboard, but may fail on other platforms.
 */
async function tryClipboardPdf(blob: Blob): Promise<boolean> {
	try {
		// Try the modern Clipboard API first
		await navigator.clipboard.write([
			new ClipboardItem({ "application/pdf": blob }),
		]);
		return true;
	} catch {
		// Clipboard API doesn't support PDF on this platform
	}

	if (Platform.isDesktop) {
		try {
			// Try Electron's clipboard as fallback
			const electron = require("electron");
			if (electron?.clipboard) {
				const buffer = Buffer.from(await blob.arrayBuffer());
				electron.clipboard.writeBuffer("com.adobe.pdf", buffer);
				return true;
			}
		} catch {
			// Not in Electron or clipboard write failed
		}
	}

	return false;
}
