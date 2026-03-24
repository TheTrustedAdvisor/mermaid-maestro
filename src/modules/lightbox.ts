import { App, Modal } from "obsidian";
import { parseViewBox, setViewBox, sanitizeSvg, type ViewBox } from "../utils/svg-utils";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;
const ZOOM_STEP = 0.15;
const PAN_STEP = 50;

export class MermaidLightboxModal extends Modal {
	private svg: SVGSVGElement;
	private displaySvg: SVGSVGElement | null = null;
	private container: HTMLDivElement | null = null;
	private zoomIndicator: HTMLDivElement | null = null;
	private hintEl: HTMLDivElement | null = null;

	// Pan/Zoom state
	private zoom = 1;
	private panX = 0;
	private panY = 0;
	private originalViewBox: ViewBox | null = null;

	// Drag state
	private isDragging = false;
	private dragStartX = 0;
	private dragStartY = 0;
	private dragStartPanX = 0;
	private dragStartPanY = 0;

	// Minimap state
	private minimapEl: HTMLDivElement | null = null;
	private minimapSvgContainer: HTMLDivElement | null = null;
	private minimapViewport: HTMLDivElement | null = null;
	private minimapDragging = false;

	// Bound handlers for cleanup
	private boundOnKeyDown: (e: KeyboardEvent) => void;
	private boundMinimapMouseMove: (e: MouseEvent) => void;
	private boundMinimapMouseUp: () => void;

	constructor(app: App, svg: SVGSVGElement) {
		super(app);
		this.svg = svg;
		this.boundOnKeyDown = this.onKeyDown.bind(this);
		this.boundMinimapMouseMove = (e: MouseEvent) => {
			if (!this.minimapDragging) return;
			this.minimapJumpTo(e.clientX, e.clientY);
		};
		this.boundMinimapMouseUp = () => {
			this.minimapDragging = false;
		};
	}

	onOpen() {
		const { contentEl, modalEl } = this;

		// Style the modal for fullscreen-like display
		modalEl.addClass("mermaid-oneinall-lightbox");

		// Theme-aware background: detect dark/light mode
		const isDark = document.body.classList.contains("theme-dark");
		modalEl.addClass(isDark ? "mermaid-oneinall-lightbox-dark" : "mermaid-oneinall-lightbox-light");

		// Create container
		this.container = contentEl.createDiv({ cls: "mermaid-oneinall-lightbox-container" });

		// Load the diagram
		this.loadDiagram(this.svg);

		// Zoom indicator
		const indicatorBar = contentEl.createDiv({ cls: "mermaid-oneinall-indicator-bar" });
		this.zoomIndicator = indicatorBar.createDiv({ cls: "mermaid-oneinall-zoom-indicator" });
		this.updateZoomIndicator();

		// Minimap
		this.buildMinimap(contentEl);

		// Usage hint (fades out after first interaction)
		this.hintEl = contentEl.createDiv({ cls: "mermaid-oneinall-hint" });
		this.hintEl.textContent = "Scroll to zoom \u00b7 Drag to pan \u00b7 Double-click to fit \u00b7 R to reset";

		// Register event listeners
		this.registerMouseEvents();
		document.addEventListener("keydown", this.boundOnKeyDown);
	}

	onClose() {
		document.removeEventListener("keydown", this.boundOnKeyDown);
		document.removeEventListener("mousemove", this.boundMinimapMouseMove);
		document.removeEventListener("mouseup", this.boundMinimapMouseUp);
		this.contentEl.empty();
		this.displaySvg = null;
		this.container = null;
		this.zoomIndicator = null;
		this.hintEl = null;
		this.minimapEl = null;
		this.minimapSvgContainer = null;
		this.minimapViewport = null;
	}

	// ─── Diagram Loading ─────────────────────────────────────────────────────

	private loadDiagram(src: SVGSVGElement): void {
		if (!this.container) return;

		// Remove previous SVG
		this.container.empty();

		// Clone the SVG and sanitize it
		this.displaySvg = src.cloneNode(true) as SVGSVGElement;
		sanitizeSvg(this.displaySvg);

		// Read and store the original viewBox
		this.originalViewBox = parseViewBox(this.displaySvg);
		if (!this.originalViewBox) {
			const bbox = src.getBBox();
			const w = parseFloat(src.getAttribute("width") || "") || bbox.width || 800;
			const h = parseFloat(src.getAttribute("height") || "") || bbox.height || 600;
			this.originalViewBox = { x: 0, y: 0, width: w, height: h };
			setViewBox(this.displaySvg, this.originalViewBox);
		}

		// Set SVG to fill the container
		this.displaySvg.setAttribute("width", "100%");
		this.displaySvg.setAttribute("height", "100%");
		this.displaySvg.setAttribute("preserveAspectRatio", "xMidYMid meet");

		this.container.appendChild(this.displaySvg);

		// Reset pan/zoom state
		this.resetView();
	}

	// ─── Minimap ──────────────────────────────────────────────────────────────

	private buildMinimap(contentEl: HTMLElement): void {
		this.minimapEl = contentEl.createDiv({ cls: "mermaid-oneinall-minimap" });

		// Container that holds a scaled clone of the SVG
		this.minimapSvgContainer = this.minimapEl.createDiv({
			cls: "mermaid-oneinall-minimap-svg",
		});

		// Viewport rectangle drawn on top
		this.minimapViewport = this.minimapEl.createDiv({
			cls: "mermaid-oneinall-minimap-viewport",
		});

		this.refreshMinimapSvg();

		// Click/drag on minimap to jump viewport
		this.minimapEl.addEventListener("mousedown", (e) => {
			e.stopPropagation();
			e.preventDefault();
			this.minimapDragging = true;
			this.minimapJumpTo(e.clientX, e.clientY);
		});

		document.addEventListener("mousemove", this.boundMinimapMouseMove);
		document.addEventListener("mouseup", this.boundMinimapMouseUp);
	}

	private refreshMinimapSvg(): void {
		if (!this.minimapSvgContainer || !this.displaySvg) return;
		this.minimapSvgContainer.empty();

		// Place a lightweight clone (no event listeners needed), sanitized
		const clone = this.displaySvg.cloneNode(true) as SVGSVGElement;
		sanitizeSvg(clone);
		if (this.originalViewBox) {
			setViewBox(clone, this.originalViewBox);
		}
		clone.setAttribute("width", "100%");
		clone.setAttribute("height", "100%");
		clone.setAttribute("preserveAspectRatio", "xMidYMid meet");
		clone.style.pointerEvents = "none";
		this.minimapSvgContainer.appendChild(clone);
	}

	private updateMinimap(): void {
		if (!this.minimapEl || !this.minimapViewport || !this.originalViewBox) return;

		// Show minimap only when zoomed in
		if (this.zoom <= 1) {
			this.minimapEl.addClass("mermaid-oneinall-minimap-hidden");
			return;
		}
		this.minimapEl.removeClass("mermaid-oneinall-minimap-hidden");

		// Calculate viewport rectangle as fraction of the full diagram
		const vbW = this.originalViewBox.width;
		const vbH = this.originalViewBox.height;
		const visibleW = vbW / this.zoom;
		const visibleH = vbH / this.zoom;

		// Position of the pan origin relative to full diagram
		const ox = this.originalViewBox.x;
		const oy = this.originalViewBox.y;

		const leftFrac = (this.panX - ox) / vbW;
		const topFrac = (this.panY - oy) / vbH;
		const widthFrac = visibleW / vbW;
		const heightFrac = visibleH / vbH;

		// Clamp to [0, 1]
		const clampedLeft = Math.max(0, Math.min(1 - widthFrac, leftFrac));
		const clampedTop = Math.max(0, Math.min(1 - heightFrac, topFrac));

		this.minimapViewport.style.left = `${clampedLeft * 100}%`;
		this.minimapViewport.style.top = `${clampedTop * 100}%`;
		this.minimapViewport.style.width = `${Math.min(1, widthFrac) * 100}%`;
		this.minimapViewport.style.height = `${Math.min(1, heightFrac) * 100}%`;
	}

	private minimapJumpTo(clientX: number, clientY: number): void {
		if (!this.minimapEl || !this.originalViewBox) return;

		const rect = this.minimapEl.getBoundingClientRect();
		const fracX = (clientX - rect.left) / rect.width;
		const fracY = (clientY - rect.top) / rect.height;

		// Center the viewport on the clicked point
		const vbW = this.originalViewBox.width;
		const vbH = this.originalViewBox.height;
		const visibleW = vbW / this.zoom;
		const visibleH = vbH / this.zoom;

		this.panX = this.originalViewBox.x + fracX * vbW - visibleW / 2;
		this.panY = this.originalViewBox.y + fracY * vbH - visibleH / 2;
		this.applyTransform();
	}

	// ─── Mouse Events ─────────────────────────────────────────────────────────

	private hideHint(): void {
		if (this.hintEl) {
			this.hintEl.addClass("mermaid-oneinall-hint-hidden");
		}
	}

	private registerMouseEvents() {
		if (!this.container) return;

		// Zoom with mouse wheel
		this.container.addEventListener("wheel", (e) => {
			e.preventDefault();
			this.hideHint();
			const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
			this.zoomAt(e.clientX, e.clientY, delta);
		}, { passive: false });

		// Pan with drag
		this.container.addEventListener("mousedown", (e) => {
			if (e.button !== 0) return;
			this.isDragging = true;
			this.dragStartX = e.clientX;
			this.dragStartY = e.clientY;
			this.dragStartPanX = this.panX;
			this.dragStartPanY = this.panY;
			e.preventDefault();
		});

		this.container.addEventListener("mousemove", (e) => {
			if (!this.isDragging) return;
			this.hideHint();
			const dx = e.clientX - this.dragStartX;
			const dy = e.clientY - this.dragStartY;

			if (!this.originalViewBox || !this.container) return;
			const rect = this.container.getBoundingClientRect();
			const scaleX = (this.originalViewBox.width / this.zoom) / rect.width;
			const scaleY = (this.originalViewBox.height / this.zoom) / rect.height;

			this.panX = this.dragStartPanX - dx * scaleX;
			this.panY = this.dragStartPanY - dy * scaleY;
			this.applyTransform();
		});

		this.container.addEventListener("mouseup", () => {
			this.isDragging = false;
		});

		this.container.addEventListener("mouseleave", () => {
			this.isDragging = false;
		});

		// Double-click to reset
		this.container.addEventListener("dblclick", (e) => {
			e.preventDefault();
			this.resetView();
		});

		// Touch support
		this.registerTouchEvents();
	}

	private registerTouchEvents() {
		if (!this.container) return;

		let lastTouchDistance = 0;

		this.container.addEventListener("touchstart", (e) => {
			this.hideHint();
			if (e.touches.length === 1) {
				this.isDragging = true;
				this.dragStartX = e.touches[0].clientX;
				this.dragStartY = e.touches[0].clientY;
				this.dragStartPanX = this.panX;
				this.dragStartPanY = this.panY;
			} else if (e.touches.length === 2) {
				this.isDragging = false;
				lastTouchDistance = this.getTouchDistance(e.touches);
			}
			e.preventDefault();
		}, { passive: false });

		this.container.addEventListener("touchmove", (e) => {
			if (e.touches.length === 1 && this.isDragging) {
				const dx = e.touches[0].clientX - this.dragStartX;
				const dy = e.touches[0].clientY - this.dragStartY;

				if (!this.originalViewBox || !this.container) return;
				const rect = this.container.getBoundingClientRect();
				const scaleX = (this.originalViewBox.width / this.zoom) / rect.width;
				const scaleY = (this.originalViewBox.height / this.zoom) / rect.height;

				this.panX = this.dragStartPanX - dx * scaleX;
				this.panY = this.dragStartPanY - dy * scaleY;
				this.applyTransform();
			} else if (e.touches.length === 2) {
				const newDistance = this.getTouchDistance(e.touches);
				if (lastTouchDistance === 0) {
					lastTouchDistance = newDistance;
					return;
				}
				const scale = newDistance / lastTouchDistance;
				const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
				const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
				const delta = this.zoom * (scale - 1);
				lastTouchDistance = newDistance;
				this.zoomAt(midX, midY, delta);
			}
			e.preventDefault();
		}, { passive: false });

		this.container.addEventListener("touchend", () => {
			this.isDragging = false;
		});
	}

	private getTouchDistance(touches: TouchList): number {
		const dx = touches[0].clientX - touches[1].clientX;
		const dy = touches[0].clientY - touches[1].clientY;
		return Math.sqrt(dx * dx + dy * dy);
	}

	// ─── Zoom / Pan / Transform ───────────────────────────────────────────────

	/**
	 * Zoom centered on a specific screen position.
	 */
	private zoomAt(screenX: number, screenY: number, delta: number): void {
		const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom + delta));
		if (newZoom === this.zoom) return;

		if (!this.originalViewBox || !this.container) return;

		const rect = this.container.getBoundingClientRect();
		const relX = (screenX - rect.left) / rect.width;
		const relY = (screenY - rect.top) / rect.height;

		const vbWidth = this.originalViewBox.width / this.zoom;
		const vbHeight = this.originalViewBox.height / this.zoom;
		const cursorVbX = this.panX + relX * vbWidth;
		const cursorVbY = this.panY + relY * vbHeight;

		this.zoom = newZoom;

		const newVbWidth = this.originalViewBox.width / this.zoom;
		const newVbHeight = this.originalViewBox.height / this.zoom;
		this.panX = cursorVbX - relX * newVbWidth;
		this.panY = cursorVbY - relY * newVbHeight;

		this.applyTransform();
	}

	/**
	 * Apply current zoom and pan to the SVG viewBox.
	 */
	private applyTransform(): void {
		if (!this.displaySvg || !this.originalViewBox) return;

		const vbWidth = this.originalViewBox.width / this.zoom;
		const vbHeight = this.originalViewBox.height / this.zoom;

		setViewBox(this.displaySvg, {
			x: this.panX,
			y: this.panY,
			width: vbWidth,
			height: vbHeight,
		});

		this.updateZoomIndicator();
		this.updateMinimap();
	}

	private updateZoomIndicator(): void {
		if (this.zoomIndicator) {
			this.zoomIndicator.textContent = `${Math.round(this.zoom * 100)}%`;
		}
	}

	private resetView(): void {
		this.zoom = 1;
		this.panX = this.originalViewBox?.x ?? 0;
		this.panY = this.originalViewBox?.y ?? 0;
		this.applyTransform();
	}

	// ─── Keyboard ─────────────────────────────────────────────────────────────

	private onKeyDown(e: KeyboardEvent): void {
		switch (e.key) {
			case "+":
			case "=":
				e.preventDefault();
				this.hideHint();
				if (this.container) {
					const rect = this.container.getBoundingClientRect();
					this.zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, ZOOM_STEP);
				}
				break;
			case "-":
				e.preventDefault();
				this.hideHint();
				if (this.container) {
					const rect = this.container.getBoundingClientRect();
					this.zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, -ZOOM_STEP);
				}
				break;
			case "ArrowLeft":
				e.preventDefault();
				this.panX -= PAN_STEP / this.zoom;
				this.applyTransform();
				break;
			case "ArrowRight":
				e.preventDefault();
				this.panX += PAN_STEP / this.zoom;
				this.applyTransform();
				break;
			case "ArrowUp":
				e.preventDefault();
				this.panY -= PAN_STEP / this.zoom;
				this.applyTransform();
				break;
			case "ArrowDown":
				e.preventDefault();
				this.panY += PAN_STEP / this.zoom;
				this.applyTransform();
				break;
			case "r":
			case "R":
				e.preventDefault();
				this.resetView();
				break;
			case "0":
				e.preventDefault();
				this.resetView();
				break;
		}
	}
}
