import { MarkdownPostProcessorContext } from "obsidian";
import type MermaidOneInAllPlugin from "./main";
import { applyAutoFit } from "./modules/auto-fit";
import { createToolbar } from "./modules/toolbar";

const WRAPPER_CLASS = "mermaid-oneinall-enhanced";

// WeakSet prevents memory leaks — entries are GC'd when DOM nodes are removed
const processedSvgs = new WeakSet<SVGSVGElement>();

/**
 * Process a rendered element to find and enhance Mermaid SVGs.
 * Important: Does NOT reparent DOM nodes — Obsidian's Live Preview tracks
 * its component tree and reparenting breaks cleanup.
 */
export function createPostProcessor(plugin: MermaidOneInAllPlugin) {
	return (el: HTMLElement, _ctx: MarkdownPostProcessorContext) => {
		console.log("Maestro: post-processor called, el:", el.tagName, el.className, "innerHTML length:", el.innerHTML.length);
		console.log("Maestro: looking for SVGs in:", el.querySelectorAll("svg").length, "total SVGs,",
			el.querySelectorAll(".mermaid").length, "mermaid containers,",
			el.querySelectorAll(".mermaid svg").length, "mermaid SVGs");

		// Process any Mermaid SVGs already rendered
		processMermaidSvgs(el, plugin);

		// Debounced MutationObserver: Mermaid renders asynchronously in Live Preview.
		// 150ms debounce batches rapid DOM mutations (many diagrams in one note).
		let debounceTimer: number | null = null;

		const observer = new MutationObserver((mutations) => {
			console.log("Maestro: MutationObserver fired, mutations:", mutations.length);
			if (debounceTimer !== null) window.clearTimeout(debounceTimer);
			debounceTimer = window.setTimeout(() => {
				debounceTimer = null;
				console.log("Maestro: debounce fired, checking for SVGs...");
				processMermaidSvgs(el, plugin);
			}, 150);
		});

		observer.observe(el, { childList: true, subtree: true });

		// Clean up observer when plugin unloads
		plugin.register(() => {
			observer.disconnect();
			if (debounceTimer !== null) window.clearTimeout(debounceTimer);
		});
	};
}

function processMermaidSvgs(el: HTMLElement, plugin: MermaidOneInAllPlugin): void {
	const svgs = el.querySelectorAll<SVGSVGElement>(
		".mermaid svg, pre.mermaid svg, svg[id^='mermaid-']"
	);

	console.log("Maestro: processMermaidSvgs found", svgs.length, "candidate SVGs");

	for (const svg of Array.from(svgs)) {
		// WeakSet dedup — no DOM pollution
		if (processedSvgs.has(svg)) {
			console.log("Maestro: skipping already processed SVG");
			continue;
		}

		// SVG readiness check: Mermaid may have created the <svg> tag
		// but not yet populated it with content (async rendering)
		if (svg.childElementCount === 0) {
			console.log("Maestro: skipping empty SVG (childElementCount=0)");
			continue;
		}

		// Check if not connected to DOM
		if (!svg.isConnected) {
			console.log("Maestro: skipping disconnected SVG");
			continue;
		}

		processedSvgs.add(svg);

		// Find the mermaid container (parent with .mermaid class)
		const mermaidContainer = svg.closest(".mermaid") as HTMLElement | null;
		if (!mermaidContainer) {
			console.log("Maestro: skipping SVG - no .mermaid parent found");
			continue;
		}

		console.log("Maestro: ENHANCING diagram!", svg.id, "children:", svg.childElementCount);

		// Do NOT reparent — just add our class to the existing container.
		// Reparenting breaks Obsidian's Live Preview component tracking.
		mermaidContainer.classList.add(WRAPPER_CLASS);

		// Apply auto-fit
		if (plugin.settings.autoFitEnabled) {
			applyAutoFit(svg);
		}

		// Register click for lightbox
		if (plugin.settings.lightboxEnabled) {
			mermaidContainer.style.cursor = "pointer";
			mermaidContainer.addEventListener("click", (e) => {
				// Don't open lightbox if user is selecting text
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
