import type MermaidOneInAllPlugin from "./main";
import { applyAutoFit } from "./modules/auto-fit";
import { createToolbar } from "./modules/toolbar";

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

		// Skip if already enhanced
		const mermaidContainer = svg.closest(".mermaid") as HTMLElement | null;
		if (!mermaidContainer) continue;
		if (mermaidContainer.classList.contains(ENHANCED_CLASS)) continue;

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
	}
}
