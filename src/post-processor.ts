import type MermaidMaestroPlugin from "./main";
import { applyAutoFit } from "./modules/auto-fit";
import { createToolbar } from "./modules/toolbar";
import { rasterizeSvgToCanvas, releaseCanvas } from "./utils/render-utils";

const ENHANCED_CLASS = "mermaid-oneinall-enhanced";

// WeakSet prevents memory leaks — entries are GC'd when DOM nodes are removed
const processedSvgs = new WeakSet<SVGSVGElement>();

// AbortControllers for event listener cleanup on re-enhancement
const containerAbortControllers = new WeakMap<HTMLElement, AbortController>();

/**
 * Initialize Mermaid diagram detection using a global MutationObserver.
 *
 * Why not registerMarkdownPostProcessor?
 * Obsidian renders Mermaid blocks asynchronously and separately from the
 * markdown post-processor pipeline. The post-processor never receives
 * elements containing Mermaid SVGs. All successful Mermaid plugins use
 * a MutationObserver on document.body instead.
 */
export function initMermaidObserver(plugin: MermaidMaestroPlugin): void {
	let debounceTimer: number | null = null;

	const debouncedScan = () => {
		if (debounceTimer !== null) window.clearTimeout(debounceTimer);
		debounceTimer = window.setTimeout(() => {
			debounceTimer = null;
			scanAndEnhance(plugin);
		}, 150);
	};

	const observer = new MutationObserver((mutations) => {
		// Early exit: only schedule a scan if added nodes could contain Mermaid
		const hasPotentialMermaid = mutations.some((m) =>
			Array.from(m.addedNodes).some(
				(n) =>
					n instanceof HTMLElement &&
					(n.classList.contains("mermaid") ||
						n.querySelector?.(".mermaid, svg[id^='mermaid-']"))
			)
		);
		if (hasPotentialMermaid) debouncedScan();
	});

	observer.observe(document.body, { childList: true, subtree: true });

	// Cleanup on plugin unload
	plugin.register(() => {
		observer.disconnect();
		if (debounceTimer !== null) window.clearTimeout(debounceTimer);
	});

	// Also scan on layout changes (routed through same debounce)
	plugin.registerEvent(
		plugin.app.workspace.on("layout-change", debouncedScan)
	);

	// Initial scan after a short delay to catch already-rendered diagrams
	const initTimer = window.setTimeout(() => scanAndEnhance(plugin), 500);
	plugin.register(() => window.clearTimeout(initTimer));
}

function scanAndEnhance(plugin: MermaidMaestroPlugin): void {
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

		// Find the Mermaid container
		const mermaidContainer = svg.closest(".mermaid");
		if (!(mermaidContainer instanceof HTMLElement)) continue;

		// If container was already enhanced but SVG is new (re-rendered),
		// reset so we re-attach listeners to the fresh SVG.
		if (mermaidContainer.classList.contains(ENHANCED_CLASS)) {
			mermaidContainer.classList.remove(ENHANCED_CLASS);
		}

		processedSvgs.add(svg);
		mermaidContainer.classList.add(ENHANCED_CLASS);

		// Abort previous listeners on this container (handles re-enhancement)
		const prevAc = containerAbortControllers.get(mermaidContainer);
		if (prevAc) prevAc.abort();
		const ac = new AbortController();
		containerAbortControllers.set(mermaidContainer, ac);

		// Release drag-export thumbnail canvas when this container is re-enhanced
		ac.signal.addEventListener("abort", () => {
			const thumb = (mermaidContainer as unknown as Record<string, unknown>).__thumbCanvas as HTMLCanvasElement | undefined;
			if (thumb) {
				releaseCanvas(thumb);
				delete (mermaidContainer as unknown as Record<string, unknown>).__thumbCanvas;
			}
		});

		// Helper: resolve current SVG lazily to avoid stale references
		const getCurrentSvg = () =>
			mermaidContainer.querySelector("svg") as SVGSVGElement | null;

		// Apply auto-fit
		if (plugin.settings.autoFitEnabled) {
			applyAutoFit(svg);
		}

		// Register click for lightbox
		if (plugin.settings.lightboxEnabled) {
			mermaidContainer.style.cursor = "pointer";
			mermaidContainer.addEventListener("click", (e) => {
				if (window.getSelection()?.toString()) return;
				const s = getCurrentSvg();
				if (!s) return;
				e.preventDefault();
				e.stopPropagation();
				plugin.openLightbox(s);
			}, { signal: ac.signal });
		}

		// Add hover toolbar
		if (plugin.settings.toolbarEnabled) {
			createToolbar(mermaidContainer, svg, mermaidContainer, plugin);
		}

		// Register context menu
		if (plugin.settings.contextMenuEnabled) {
			mermaidContainer.addEventListener("contextmenu", (e) => {
				const s = getCurrentSvg();
				if (!s) return;
				e.preventDefault();
				e.stopPropagation();
				plugin.showContextMenu(e, s, mermaidContainer);
			}, { signal: ac.signal });
		}

		// Drag & drop export
		setupDragExport(mermaidContainer, ac, plugin);
	}
}

/**
 * Make a Mermaid container draggable, exporting the SVG as PNG on drag start.
 * Pre-renders the PNG on mouseenter so that the synchronous dragstart handler
 * can set dataTransfer without awaiting async operations.
 *
 * Cache persists across hover cycles and is only invalidated on re-enhancement
 * (via AbortController).
 */
function setupDragExport(
	container: HTMLElement,
	ac: AbortController,
	plugin: MermaidMaestroPlugin
): void {
	container.setAttribute("draggable", "true");

	let cachedPngDataUrl: string | null = null;
	let cachedThumbCanvas: HTMLCanvasElement | null = null;
	let renderInProgress = false;

	// Helper: resolve current SVG lazily
	const getCurrentSvg = () =>
		container.querySelector("svg") as SVGSVGElement | null;

	const preRenderPng = async () => {
		if (renderInProgress || cachedPngDataUrl) return;
		renderInProgress = true;

		try {
			const svg = getCurrentSvg();
			if (!svg || !svg.isConnected) return;

			// Cap drag preview at 2x for performance
			const scale = Math.min(2, plugin.settings.pngScale);
			const canvas = await rasterizeSvgToCanvas(svg, scale);

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
			// Store reference for cleanup on abort
			(container as unknown as Record<string, unknown>).__thumbCanvas = thumbCanvas;

			// Release the full-size canvas
			releaseCanvas(canvas);
		} catch (err) {
			console.error("Mermaid Maestro: pre-render failed", err);
		} finally {
			renderInProgress = false;
		}
	};

	container.addEventListener("mouseenter", () => {
		void preRenderPng();
	}, { signal: ac.signal });

	container.addEventListener("dragstart", (e: DragEvent) => {
		if (!e.dataTransfer) return;

		if (!cachedPngDataUrl) {
			// Pre-render hasn't finished, cancel the drag
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
	}, { signal: ac.signal });
}
