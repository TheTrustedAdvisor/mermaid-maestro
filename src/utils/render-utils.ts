import { cloneSvgWithStyles, serializeSvg, getSvgDimensions } from "./svg-utils";
import { svgToBase64DataUrl } from "./clipboard-utils";

/** Maximum canvas pixel budget to prevent memory exhaustion (~4096x4096). */
const MAX_CANVAS_PIXELS = 16_000_000;

/**
 * Rasterize an SVG to a canvas at the given scale with optional background.
 * Automatically reduces scale if the canvas would exceed the pixel budget.
 * Callers should call releaseCanvas() when done with the canvas.
 */
export async function rasterizeSvgToCanvas(
	svg: SVGSVGElement,
	scale: number,
	background?: "transparent" | "white",
): Promise<HTMLCanvasElement> {
	const dims = getSvgDimensions(svg);

	if (dims.width <= 0 || dims.height <= 0) {
		throw new Error("Cannot rasterize: diagram has zero dimensions.");
	}

	// Auto-reduce scale if canvas would exceed pixel budget
	let s = scale;
	while (s > 1 && dims.width * s * dims.height * s > MAX_CANVAS_PIXELS) {
		s -= 0.5;
	}
	s = Math.max(1, s);

	const clone = cloneSvgWithStyles(svg);
	clone.removeAttribute("style");
	clone.setAttribute("width", String(Math.ceil(dims.width * s)));
	clone.setAttribute("height", String(Math.ceil(dims.height * s)));
	clone.setAttribute("preserveAspectRatio", "xMidYMid meet");

	const svgString = serializeSvg(clone);
	const dataUrl = svgToBase64DataUrl(svgString);

	const img = new Image();
	await new Promise<void>((resolve, reject) => {
		img.onload = () => resolve();
		img.onerror = () => reject(new Error("Failed to load SVG as image"));
		img.src = dataUrl;
	});

	const canvas = document.createElement("canvas");
	canvas.width = img.naturalWidth;
	canvas.height = img.naturalHeight;

	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Could not get canvas context");

	if (background === "white") {
		ctx.fillStyle = "#ffffff";
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}

	ctx.drawImage(img, 0, 0);

	// Release image buffer early
	img.src = "";

	return canvas;
}

/** Release canvas pixel buffer to free memory. */
export function releaseCanvas(canvas: HTMLCanvasElement): void {
	canvas.width = 0;
	canvas.height = 0;
}
