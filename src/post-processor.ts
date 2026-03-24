import type MermaidOneInAllPlugin from "./main";
import { applyAutoFit } from "./modules/auto-fit";
import { createToolbar } from "./modules/toolbar";
import { cloneSvgWithStyles, serializeSvg, parseViewBox, sanitizeSvg } from "./utils/svg-utils";
import { svgToBase64DataUrl } from "./utils/clipboard-utils";

const ENHANCED_CLASS = "mermaid-oneinall-enhanced";

// WeakSet prevents memory leaks — entries are GC'd when DOM nodes are removed
const processedSvgs = new WeakSet<SVGSVGElement>();

/**
 * Initialize Mermaid diagram detection using a global MutationObserver.
 *
 * Why not registerMarkdownPostProcessor?
 * Obsidian renders Mermaid blocks asynchronously and separately from the
 * markdown post-processor pipeline. The post-processor never receives
 * elements containing Mermaid SVGs. All successful Mermaid plugins use
 * a MutationObserver on document.body instead.
 */
export function initMermaidObserver(plugin: MermaidOneInAllPlugin): void {
	let debounceTimer: number | null = null;

	const observer = new MutationObserver(() => {
		if (debounceTimer !== null) window.clearTimeout(debounceTimer);
		debounceTimer = window.setTimeout(() => {
			debounceTimer = null;
			scanAndEnhance(plugin);
		}, 150);
	});

	observer.observe(document.body, { childList: true, subtree: true });

	// Cleanup on plugin unload
	plugin.register(() => {
		observer.disconnect();
		if (debounceTimer !== null) window.clearTimeout(debounceTimer);
	});

	// Also scan on layout changes and file opens (with slight delay)
	plugin.registerEvent(
		plugin.app.workspace.on("layout-change", () => {
			setTimeout(() => scanAndEnhance(plugin), 300);
		})
	);

	// Initial scan after a short delay to catch already-rendered diagrams
	setTimeout(() => scanAndEnhance(plugin), 500);
}

function scanAndEnhance(plugin: MermaidOneInAllPlugin): void {
	const svgs = document.querySelectorAll<SVGSVGElement>(
		".mermaid svg, pre.mermaid svg, svg[id^='mermaid-']"
	);

	for (const svg of Array.from(svgs)) {
		// WeakSet dedup
		if (processedSvgs.has(svg)) continue;

		// SVG readiness: skip if Mermaid hasn't populated it yet
		if (svg.childElementCount === 0) continue;

		// Skip disconnected nodes
		if (!svg.isConnected) continue;

		// Skip if already enhanced — but re-enhance if the SVG inside changed
		const mermaidContainer = svg.closest(".mermaid") as HTMLElement | null;
		if (!mermaidContainer) continue;
		if (mermaidContainer.classList.contains(ENHANCED_CLASS)) {
			// Check if the SVG is new (re-rendered by Obsidian)
			if (!processedSvgs.has(svg)) {
				mermaidContainer.classList.remove(ENHANCED_CLASS);
			} else {
				continue;
			}
		}

		processedSvgs.add(svg);
		mermaidContainer.classList.add(ENHANCED_CLASS);

		// Apply auto-fit
		if (plugin.settings.autoFitEnabled) {
			applyAutoFit(svg);
		}

		// Register click for lightbox
		if (plugin.settings.lightboxEnabled) {
			mermaidContainer.style.cursor = "pointer";
			mermaidContainer.addEventListener("click", (e) => {
				if (window.getSelection()?.toString()) return;
				e.preventDefault();
				e.stopPropagation();
				plugin.openLightbox(svg);
			});
		}

		// Add hover toolbar
		if (plugin.settings.toolbarEnabled) {
			createToolbar(mermaidContainer, svg, mermaidContainer, plugin);
		}

		// Register context menu
		if (plugin.settings.contextMenuEnabled) {
			mermaidContainer.addEventListener("contextmenu", (e) => {
				e.preventDefault();
				e.stopPropagation();
				plugin.showContextMenu(e, svg, mermaidContainer);
			});
		}

		// Drag & drop export: make the container draggable so users can drag
		// the diagram as a PNG into other applications.
		setupDragExport(mermaidContainer, svg, plugin);
	}
}

/**
 * Make a Mermaid container draggable, exporting the SVG as PNG on drag start.
 * Pre-renders the PNG on mouseenter so that the synchronous dragstart handler
 * can set dataTransfer without awaiting async operations.
 */
function setupDragExport(
	container: HTMLElement,
	svg: SVGSVGElement,
	plugin: MermaidOneInAllPlugin
): void {
	container.setAttribute("draggable", "true");

	let cachedPngDataUrl: string | null = null;
	let cachedThumbCanvas: HTMLCanvasElement | null = null;
	let cacheTimer: number | null = null;

	const preRenderPng = () => {
		// Debounce: avoid re-rendering on rapid mouse events
		if (cacheTimer !== null) return;
		if (cachedPngDataUrl) return;

		cacheTimer = window.setTimeout(async () => {
			cacheTimer = null;
			try {
				const scale = plugin.settings.pngScale;
				const vb = parseViewBox(svg);
				const vbW = vb ? vb.width : svg.getBBox().width;
				const vbH = vb ? vb.height : svg.getBBox().height;

				if (vbW <= 0 || vbH <= 0) return;

				const clone = cloneSvgWithStyles(svg);
				clone.removeAttribute("style");
				clone.setAttribute("width", String(Math.ceil(vbW * scale)));
				clone.setAttribute("height", String(Math.ceil(vbH * scale)));
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
				if (!ctx) return;
				ctx.drawImage(img, 0, 0);

				cachedPngDataUrl = canvas.toDataURL("image/png");

				// Build thumbnail for drag image
				const thumbCanvas = document.createElement("canvas");
				const thumbScale = Math.min(1, 200 / Math.max(canvas.width, canvas.height));
				thumbCanvas.width = Math.ceil(canvas.width * thumbScale);
				thumbCanvas.height = Math.ceil(canvas.height * thumbScale);
				const thumbCtx = thumbCanvas.getContext("2d");
				if (thumbCtx) {
					thumbCtx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
				}
				cachedThumbCanvas = thumbCanvas;
			} catch (err) {
				console.error("Mermaid Maestro: pre-render failed", err);
			}
		}, 100);
	};

	container.addEventListener("mouseenter", preRenderPng);

	// Invalidate cache when SVG might change
	container.addEventListener("mouseleave", () => {
		cachedPngDataUrl = null;
		cachedThumbCanvas = null;
		if (cacheTimer !== null) {
			window.clearTimeout(cacheTimer);
			cacheTimer = null;
		}
	});

	container.addEventListener("dragstart", (e: DragEvent) => {
		if (!e.dataTransfer) return;

		if (!cachedPngDataUrl) {
			// Fallback: if pre-render hasn't finished, cancel the drag
			e.preventDefault();
			return;
		}

		if (cachedThumbCanvas) {
			e.dataTransfer.setDragImage(
				cachedThumbCanvas,
				cachedThumbCanvas.width / 2,
				cachedThumbCanvas.height / 2
			);
		}

		e.dataTransfer.setData("text/uri-list", cachedPngDataUrl);
		e.dataTransfer.setData("text/plain", cachedPngDataUrl);
		e.dataTransfer.effectAllowed = "copy";
	});
}
