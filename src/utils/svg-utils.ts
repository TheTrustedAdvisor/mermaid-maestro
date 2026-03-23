export interface ViewBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Parse the viewBox attribute of an SVG element.
 * Returns null if no viewBox is set or it cannot be parsed.
 */
export function parseViewBox(svg: SVGSVGElement): ViewBox | null {
	const attr = svg.getAttribute("viewBox");
	if (!attr) return null;

	const parts = attr.trim().split(/[\s,]+/).map(Number);
	if (parts.length !== 4 || parts.some(isNaN)) return null;

	return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}

/**
 * Set the viewBox attribute on an SVG element.
 */
export function setViewBox(svg: SVGSVGElement, vb: ViewBox): void {
	svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.width} ${vb.height}`);
}

/**
 * Get the natural dimensions of an SVG element.
 * Tries viewBox first, then width/height attributes, then bounding box.
 */
export function getSvgDimensions(svg: SVGSVGElement): { width: number; height: number } {
	const vb = parseViewBox(svg);
	if (vb) return { width: vb.width, height: vb.height };

	const w = parseFloat(svg.getAttribute("width") || "0");
	const h = parseFloat(svg.getAttribute("height") || "0");
	if (w > 0 && h > 0) return { width: w, height: h };

	const bbox = svg.getBBox();
	return { width: bbox.width || 300, height: bbox.height || 200 };
}

/**
 * Clone an SVG element with all inline styles resolved.
 * This ensures the clone looks correct when detached from the DOM.
 */
export function cloneSvgWithStyles(svg: SVGSVGElement): SVGSVGElement {
	const clone = svg.cloneNode(true) as SVGSVGElement;

	// Copy computed styles to inline styles for all elements
	const origElements = svg.querySelectorAll("*");
	const cloneElements = clone.querySelectorAll("*");

	for (let i = 0; i < origElements.length; i++) {
		const origEl = origElements[i] as HTMLElement;
		const cloneEl = cloneElements[i] as HTMLElement;
		if (!origEl || !cloneEl) continue;

		const computed = window.getComputedStyle(origEl);
		// Copy key visual properties
		const props = ["fill", "stroke", "stroke-width", "font-family", "font-size",
			"font-weight", "opacity", "color", "background-color"];
		for (const prop of props) {
			const value = computed.getPropertyValue(prop);
			if (value) {
				cloneEl.style.setProperty(prop, value);
			}
		}
	}

	return clone;
}

/**
 * Serialize an SVG element to a string.
 */
export function serializeSvg(svg: SVGSVGElement): string {
	const serializer = new XMLSerializer();
	return serializer.serializeToString(svg);
}
