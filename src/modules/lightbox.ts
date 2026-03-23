import { App, Modal } from "obsidian";
import { parseViewBox, setViewBox, type ViewBox } from "../utils/svg-utils";

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

	// Bound handlers for cleanup
	private boundOnKeyDown: (e: KeyboardEvent) => void;

	constructor(app: App, svg: SVGSVGElement) {
		super(app);
		this.svg = svg;
		this.boundOnKeyDown = this.onKeyDown.bind(this);
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

		// Clone the SVG
		this.displaySvg = this.svg.cloneNode(true) as SVGSVGElement;

		// Read and store the original viewBox
		this.originalViewBox = parseViewBox(this.displaySvg);
		if (!this.originalViewBox) {
			const bbox = this.svg.getBBox();
			const w = parseFloat(this.svg.getAttribute("width") || "") || bbox.width || 800;
			const h = parseFloat(this.svg.getAttribute("height") || "") || bbox.height || 600;
			this.originalViewBox = { x: 0, y: 0, width: w, height: h };
			setViewBox(this.displaySvg, this.originalViewBox);
		}

		// Set SVG to fill the container
		this.displaySvg.setAttribute("width", "100%");
		this.displaySvg.setAttribute("height", "100%");
		this.displaySvg.setAttribute("preserveAspectRatio", "xMidYMid meet");

		this.container.appendChild(this.displaySvg);

		// Zoom indicator
		this.zoomIndicator = contentEl.createDiv({ cls: "mermaid-oneinall-zoom-indicator" });
		this.updateZoomIndicator();

		// Usage hint (fades out after first interaction)
		this.hintEl = contentEl.createDiv({ cls: "mermaid-oneinall-hint" });
		this.hintEl.textContent = "Scroll to zoom · Drag to pan · Double-click to fit · R to reset";

		// Register event listeners
		this.registerMouseEvents();
		document.addEventListener("keydown", this.boundOnKeyDown);
	}

	onClose() {
		document.removeEventListener("keydown", this.boundOnKeyDown);
		this.contentEl.empty();
		this.displaySvg = null;
		this.container = null;
		this.zoomIndicator = null;
		this.hintEl = null;
	}

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
				const scale = newDistance / lastTouchDistance;

				this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * scale));
				lastTouchDistance = newDistance;
				this.applyTransform();
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

	private onKeyDown(e: KeyboardEvent): void {
		switch (e.key) {
			case "+":
			case "=":
				e.preventDefault();
				this.hideHint();
				this.zoom = Math.min(MAX_ZOOM, this.zoom + ZOOM_STEP);
				this.applyTransform();
				break;
			case "-":
				e.preventDefault();
				this.hideHint();
				this.zoom = Math.max(MIN_ZOOM, this.zoom - ZOOM_STEP);
				this.applyTransform();
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
