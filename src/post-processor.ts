import { MarkdownPostProcessorContext } from "obsidian";
import type MermaidOneInAllPlugin from "./main";
import { applyAutoFit } from "./modules/auto-fit";
import { createToolbar } from "./modules/toolbar";

const WRAPPER_CLASS = "mermaid-oneinall-wrapper";

// WeakSet prevents memory leaks — entries are GC'd when DOM nodes are removed
const processedSvgs = new WeakSet<SVGSVGElement>();

/**
 * Process a rendered element to find and enhance Mermaid SVGs.
 * Uses WeakSet for dedup, debounced MutationObserver, and SVG readiness checks.
 */
export function createPostProcessor(plugin: MermaidOneInAllPlugin) {
	return (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
		// Process any Mermaid SVGs already rendered
		processMermaidSvgs(el, plugin);

		// Debounced MutationObserver: Mermaid renders asynchronously in Live Preview.
		// 150ms debounce batches rapid DOM mutations (many diagrams in one note).
		let debounceTimer: number | null = null;

		const observer = new MutationObserver(() => {
			if (debounceTimer !== null) window.clearTimeout(debounceTimer);
			debounceTimer = window.setTimeout(() => {
				debounceTimer = null;
				processMermaidSvgs(el, plugin);
			}, 150);
		});

		observer.observe(el, { childList: true, subtree: true });

		// Use Obsidian's lifecycle for cleanup
		ctx.addChild({
			onload() {},
			onunload() {
				observer.disconnect();
				if (debounceTimer !== null) window.clearTimeout(debounceTimer);
			},
		} as any);
	};
}

function processMermaidSvgs(el: HTMLElement, plugin: MermaidOneInAllPlugin): void {
	const svgs = el.querySelectorAll<SVGSVGElement>(
		".mermaid svg, pre.mermaid svg, svg[id^='mermaid-']"
	);

	for (const svg of Array.from(svgs)) {
		// WeakSet dedup — no DOM pollution
		if (processedSvgs.has(svg)) continue;

		// SVG readiness check: Mermaid may have created the <svg> tag
		// but not yet populated it with content (async rendering)
		if (svg.childElementCount === 0) continue;

		// Check if not connected to DOM (could happen between observer fire and debounce)
		if (!svg.isConnected) continue;

		// Check if already wrapped by another instance
		if (svg.closest("." + WRAPPER_CLASS)) continue;

		processedSvgs.add(svg);

		// Find the mermaid container (parent with .mermaid class)
		const mermaidContainer = svg.closest(".mermaid") as HTMLElement | null;
		if (!mermaidContainer) continue;

		// Wrap in our container
		const wrapper = document.createElement("div");
		wrapper.classList.add(WRAPPER_CLASS);

		mermaidContainer.parentNode?.insertBefore(wrapper, mermaidContainer);
		wrapper.appendChild(mermaidContainer);

		// Apply auto-fit
		if (plugin.settings.autoFitEnabled) {
			applyAutoFit(svg);
		}

		// Register click for lightbox
		if (plugin.settings.lightboxEnabled) {
			wrapper.style.cursor = "pointer";
			wrapper.addEventListener("click", (e) => {
				// Don't open lightbox if user is selecting text
				if (window.getSelection()?.toString()) return;
				e.preventDefault();
				e.stopPropagation();
				plugin.openLightbox(svg);
			});
		}

		// Add hover toolbar
		if (plugin.settings.toolbarEnabled) {
			createToolbar(wrapper, svg, mermaidContainer, plugin);
		}

		// Register context menu
		if (plugin.settings.contextMenuEnabled) {
			wrapper.addEventListener("contextmenu", (e) => {
				e.preventDefault();
				e.stopPropagation();
				plugin.showContextMenu(e, svg, mermaidContainer);
			});
		}
	}
}
