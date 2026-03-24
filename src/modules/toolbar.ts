import type MermaidMaestroPlugin from "../main";

/**
 * Create a hover toolbar for a Mermaid diagram.
 * Shows lightbox and context menu quick-access buttons on hover.
 */
export function createToolbar(
	wrapper: HTMLElement,
	_svg: SVGSVGElement,
	mermaidContainer: HTMLElement,
	plugin: MermaidMaestroPlugin
): HTMLElement {
	const toolbar = wrapper.createDiv({ cls: "mermaid-oneinall-toolbar" });

	// Lazy lookup avoids stale SVG references after Mermaid re-renders
	const getCurrentSvg = () =>
		mermaidContainer.querySelector("svg") as SVGSVGElement | null;

	// Fullscreen / Lightbox
	addToolbarButton(toolbar, "⛶", "Open in lightbox", () => {
		const s = getCurrentSvg();
		if (s) plugin.openLightbox(s);
	});

	// Export menu
	addToolbarButton(toolbar, "📋", "Export options", () => {
		const s = getCurrentSvg();
		if (!s) return;
		const rect = toolbar.getBoundingClientRect();
		plugin.showContextMenu(
			new MouseEvent("contextmenu", {
				clientX: rect.left,
				clientY: rect.bottom,
			}),
			s,
			mermaidContainer
		);
	});

	// Theme toggle (Lichtschalter)
	addToolbarButton(toolbar, "\u{1F313}", "Toggle diagram background", () => {
		const hasLight = mermaidContainer.classList.contains("mermaid-oneinall-light-bg");
		const hasDark = mermaidContainer.classList.contains("mermaid-oneinall-dark-bg");

		// Remove both classes first
		mermaidContainer.classList.remove("mermaid-oneinall-light-bg", "mermaid-oneinall-dark-bg");

		if (hasLight) {
			// Was light, switch to dark
			mermaidContainer.classList.add("mermaid-oneinall-dark-bg");
		} else if (hasDark) {
			// Was dark, switch back to default (remove both)
		} else {
			// No override — detect current theme and apply opposite
			const isDark = document.body.classList.contains("theme-dark");
			mermaidContainer.classList.add(isDark ? "mermaid-oneinall-light-bg" : "mermaid-oneinall-dark-bg");
		}
	});

	return toolbar;
}

function addToolbarButton(
	parent: HTMLElement,
	label: string,
	title: string,
	onClick: () => void
): HTMLButtonElement {
	const btn = parent.createEl("button", { text: label, title });
	btn.addEventListener("click", (e) => {
		e.stopPropagation();
		e.preventDefault();
		onClick();
	});
	return btn;
}
