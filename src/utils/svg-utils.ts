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
	if (parts[2] <= 0 || parts[3] <= 0) return null;

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

	try {
		const bbox = svg.getBBox();
		return { width: bbox.width || 300, height: bbox.height || 200 };
	} catch {
		// getBBox() throws on detached or hidden SVGs in some browsers
		return { width: 300, height: 200 };
	}
}

/**
 * Strip dangerous elements and event-handler attributes from an SVG node.
 * Prevents XSS when cloning untrusted SVG content.
 *
 * Note: do NOT remove <foreignObject> — Mermaid uses it for text labels.
 * Instead, we sanitize its contents.
 */
export function sanitizeSvg(svg: SVGSVGElement): void {
	const dangerousTags = [
		"script", "iframe", "embed", "object", "meta", "link",
		"animate", "set", "animateTransform",
	];
	for (const tag of dangerousTags) {
		const els = svg.querySelectorAll(tag);
		for (let i = els.length - 1; i >= 0; i--) {
			els[i].remove();
		}
	}

	// Sanitize foreignObject contents: strip non-display elements
	const foreignObjects = svg.querySelectorAll("foreignObject");
	for (const fo of Array.from(foreignObjects)) {
		const dangerous = fo.querySelectorAll(
			"script, iframe, embed, object, form, input, textarea, button, a[href]"
		);
		for (let i = dangerous.length - 1; i >= 0; i--) {
			dangerous[i].remove();
		}
	}

	// Remove ALL on* event handler attributes dynamically (not a fixed list)
	// and sanitize javascript: URLs in href/xlink:href
	const allEls = svg.querySelectorAll("*");
	for (const el of Array.from(allEls)) {
		for (const attr of Array.from(el.attributes)) {
			if (attr.name.toLowerCase().startsWith("on")) {
				el.removeAttribute(attr.name);
			}
		}
		for (const hrefAttr of ["href", "xlink:href"]) {
			const val = el.getAttribute(hrefAttr);
			if (!val) continue;
			// Block javascript: URIs
			if (/^\s*javascript\s*:/i.test(val)) {
				el.removeAttribute(hrefAttr);
			}
			// Block data: URIs except safe image types used by Mermaid
			if (/^\s*data\s*:/i.test(val) && !/^\s*data:image\/(png|jpeg|gif|svg\+xml|webp)[;,]/i.test(val)) {
				el.removeAttribute(hrefAttr);
			}
		}
	}

	// Also sanitize the root element itself
	for (const attr of Array.from(svg.attributes)) {
		if (attr.name.toLowerCase().startsWith("on")) {
			svg.removeAttribute(attr.name);
		}
	}
}

/**
 * Clone an SVG element with all inline styles resolved.
 * This ensures the clone looks correct when detached from the DOM.
 */
export function cloneSvgWithStyles(svg: SVGSVGElement): SVGSVGElement {
	const clone = svg.cloneNode(true) as SVGSVGElement;

	// Copy computed styles to inline styles BEFORE sanitizing,
	// so element indices stay aligned between original and clone.
	const origElements = svg.querySelectorAll("*");
	const cloneElements = clone.querySelectorAll("*");

	for (let i = 0; i < origElements.length; i++) {
		const origEl = origElements[i] as Element;
		const cloneEl = cloneElements[i] as Element;
		if (!origEl || !cloneEl) continue;

		const computed = window.getComputedStyle(origEl);
		const style = (cloneEl as HTMLElement).style;
		if (!style) continue;

		// Copy key visual properties
		const props = ["fill", "stroke", "stroke-width", "stroke-dasharray",
			"stroke-linecap", "stroke-linejoin", "font-family", "font-size",
			"font-weight", "opacity", "color", "background-color",
			"text-anchor", "dominant-baseline", "text-decoration"];
		for (const prop of props) {
			const value = computed.getPropertyValue(prop);
			if (value) {
				style.setProperty(prop, value);
			}
		}
	}

	// Sanitize AFTER style copying to avoid index misalignment
	sanitizeSvg(clone);

	return clone;
}

/**
 * Serialize an SVG element to a string.
 */
export function serializeSvg(svg: SVGSVGElement): string {
	const serializer = new XMLSerializer();
	return serializer.serializeToString(svg);
}
