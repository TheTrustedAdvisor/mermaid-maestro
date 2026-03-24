import { parseViewBox, getSvgDimensions, setViewBox } from "../utils/svg-utils";

/**
 * Apply auto-fit to an SVG element so it scales to fill its container width
 * while maintaining aspect ratio. Uses viewBox manipulation for crisp vector rendering.
 */
export function applyAutoFit(svg: SVGSVGElement): void {
	const dims = getSvgDimensions(svg);

	// Ensure a viewBox is set so the SVG can scale properly
	if (!parseViewBox(svg)) {
		setViewBox(svg, { x: 0, y: 0, width: dims.width, height: dims.height });
	}

	// Remove fixed width/height so the SVG fills its container
	svg.removeAttribute("width");
	svg.removeAttribute("height");
	svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

	// CSS class makes SVG responsive within its container
	svg.classList.add("mermaid-oneinall-autofit");
}
