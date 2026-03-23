import { Menu, Notice, Plugin } from "obsidian";
import {
	DEFAULT_SETTINGS,
	MermaidOneInAllSettingTab,
	type MermaidOneInAllSettings,
} from "./settings";
import { createPostProcessor } from "./post-processor";
import { cloneSvgWithStyles, serializeSvg } from "./utils/svg-utils";
import { copyPngToClipboard, copyTextToClipboard, svgToBase64DataUrl } from "./utils/clipboard-utils";
import { MermaidLightboxModal } from "./modules/lightbox";
import { exportPdf } from "./modules/export/pdf-export";

export default class MermaidOneInAllPlugin extends Plugin {
	settings: MermaidOneInAllSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();

		// Register the post-processor that enhances Mermaid diagrams
		this.registerMarkdownPostProcessor(createPostProcessor(this));

		// Settings tab
		this.addSettingTab(new MermaidOneInAllSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Open a Mermaid SVG in the lightbox modal with pan/zoom.
	 */
	openLightbox(svg: SVGSVGElement): void {
		new MermaidLightboxModal(this.app, svg).open();
	}

	/**
	 * Show the context menu for a Mermaid diagram.
	 */
	showContextMenu(event: MouseEvent, svg: SVGSVGElement, mermaidContainer: HTMLElement): void {
		const menu = new Menu();

		menu.addItem((item) =>
			item
				.setTitle("Copy as PNG (transparent)")
				.setIcon("image")
				.onClick(() => this.exportPng(svg, "transparent"))
		);

		menu.addItem((item) =>
			item
				.setTitle("Copy as PNG (white background)")
				.setIcon("image")
				.onClick(() => this.exportPng(svg, "white"))
		);

		menu.addSeparator();

		menu.addItem((item) =>
			item
				.setTitle("Copy as SVG")
				.setIcon("code")
				.onClick(() => this.exportSvg(svg))
		);

		menu.addItem((item) =>
			item
				.setTitle("Copy as PDF")
				.setIcon("file-text")
				.onClick(() => exportPdf(svg, this.settings.pngScale))
		);

		menu.addSeparator();

		menu.addItem((item) =>
			item
				.setTitle("Copy Mermaid source")
				.setIcon("clipboard-copy")
				.onClick(() => this.exportSource(mermaidContainer))
		);

		menu.showAtMouseEvent(event);
	}

	/**
	 * Export an SVG as PNG to the clipboard.
	 * Uses base64 data URL to avoid canvas tainting with external SVG references.
	 */
	private async exportPng(svg: SVGSVGElement, background: "transparent" | "white"): Promise<void> {
		try {
			const clone = cloneSvgWithStyles(svg);
			const svgString = serializeSvg(clone);

			// Base64 data URL approach — avoids canvas tainting issues
			const dataUrl = svgToBase64DataUrl(svgString);

			const img = new Image();
			await new Promise<void>((resolve, reject) => {
				img.onload = () => resolve();
				img.onerror = () => reject(new Error("Failed to load SVG as image"));
				img.src = dataUrl;
			});

			const scale = this.settings.pngScale;
			const canvas = document.createElement("canvas");
			canvas.width = img.naturalWidth * scale;
			canvas.height = img.naturalHeight * scale;

			const ctx = canvas.getContext("2d");
			if (!ctx) throw new Error("Could not get canvas context");

			if (background === "white") {
				ctx.fillStyle = "#ffffff";
				ctx.fillRect(0, 0, canvas.width, canvas.height);
			}

			ctx.scale(scale, scale);
			ctx.drawImage(img, 0, 0);

			const blob = await new Promise<Blob>((resolve, reject) => {
				canvas.toBlob(
					(b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
					"image/png"
				);
			});

			await copyPngToClipboard(blob);
			new Notice("PNG copied to clipboard!");
		} catch (err) {
			console.error("Mermaid OneInAll: PNG export failed", err);
			new Notice(`PNG export failed: ${err instanceof Error ? err.message : "Unknown error"}`);
		}
	}

	/**
	 * Export an SVG to the clipboard as SVG markup.
	 */
	private async exportSvg(svg: SVGSVGElement): Promise<void> {
		try {
			const clone = cloneSvgWithStyles(svg);
			const svgString = serializeSvg(clone);
			await copyTextToClipboard(svgString);
			new Notice("SVG copied to clipboard!");
		} catch (err) {
			console.error("Mermaid OneInAll: SVG export failed", err);
			new Notice(`SVG export failed: ${err instanceof Error ? err.message : "Unknown error"}`);
		}
	}

	/**
	 * Extract and copy the Mermaid source code from the rendered container.
	 */
	private async exportSource(mermaidContainer: HTMLElement): Promise<void> {
		try {
			const source =
				mermaidContainer.getAttribute("data-mermaid-source") ||
				mermaidContainer.getAttribute("data-source") ||
				this.extractSourceFromDom(mermaidContainer);

			if (!source) {
				new Notice("Could not find Mermaid source code.");
				return;
			}

			await copyTextToClipboard(source);
			new Notice("Mermaid source copied to clipboard!");
		} catch (err) {
			console.error("Mermaid OneInAll: Source export failed", err);
			new Notice(`Source export failed: ${err instanceof Error ? err.message : "Unknown error"}`);
		}
	}

	/**
	 * Try to extract Mermaid source from the DOM.
	 * Obsidian stores source in different ways depending on view mode.
	 */
	private extractSourceFromDom(mermaidContainer: HTMLElement): string | null {
		// aria-label often contains the original source
		const ariaLabel = mermaidContainer.getAttribute("aria-label");
		if (ariaLabel) return ariaLabel;

		// In reading view, the code block may be in a sibling <pre>
		const pre = mermaidContainer.closest("pre");
		if (pre) {
			const code = pre.querySelector("code");
			if (code) return code.textContent;
		}

		return null;
	}
}
