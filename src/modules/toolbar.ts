import type MermaidOneInAllPlugin from "../main";

/**
 * Create a hover toolbar for a Mermaid diagram wrapper.
 * Shows zoom controls and quick export buttons on hover.
 */
export function createToolbar(
	wrapper: HTMLElement,
	svg: SVGSVGElement,
	mermaidContainer: HTMLElement,
	plugin: MermaidOneInAllPlugin
): HTMLElement {
	const toolbar = wrapper.createDiv({ cls: "mermaid-oneinall-toolbar" });

	// Zoom In
	addToolbarButton(toolbar, "+", "Zoom in", () => {
		plugin.openLightbox(svg);
	});

	// Fullscreen / Lightbox
	addToolbarButton(toolbar, "⛶", "Open in lightbox", () => {
		plugin.openLightbox(svg);
	});

	// Copy as PNG
	addToolbarButton(toolbar, "📋", "Copy as PNG", () => {
		plugin.showContextMenu(
			new MouseEvent("contextmenu", {
				clientX: toolbar.getBoundingClientRect().left,
				clientY: toolbar.getBoundingClientRect().bottom,
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
