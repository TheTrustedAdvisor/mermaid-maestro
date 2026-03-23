import type MermaidOneInAllPlugin from "../main";

/**
 * Create a hover toolbar for a Mermaid diagram.
 * Shows lightbox and context menu quick-access buttons on hover.
 */
export function createToolbar(
	wrapper: HTMLElement,
	svg: SVGSVGElement,
	mermaidContainer: HTMLElement,
	plugin: MermaidOneInAllPlugin
): HTMLElement {
	const toolbar = wrapper.createDiv({ cls: "mermaid-oneinall-toolbar" });

	// Fullscreen / Lightbox
	addToolbarButton(toolbar, "⛶", "Open in lightbox", () => {
		plugin.openLightbox(svg);
	});

	// Export menu
	addToolbarButton(toolbar, "📋", "Export options", () => {
		const rect = toolbar.getBoundingClientRect();
		plugin.showContextMenu(
			new MouseEvent("contextmenu", {
				clientX: rect.left,
				clientY: rect.bottom,
			}),
			svg,
			mermaidContainer
		);
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
