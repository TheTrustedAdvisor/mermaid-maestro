import { Menu, Notice, Platform, Plugin } from "obsidian";
import {
	DEFAULT_SETTINGS,
	MermaidMaestroSettingTab,
	type MermaidMaestroSettings,
} from "./settings";
import { initMermaidObserver } from "./post-processor";
import { cloneSvgWithStyles, serializeSvg, getSvgDimensions } from "./utils/svg-utils";
import { copyPngToClipboard, copyTextToClipboard } from "./utils/clipboard-utils";
import { rasterizeSvgToCanvas, releaseCanvas } from "./utils/render-utils";
import { MermaidLightboxModal } from "./modules/lightbox";
import { exportPdf } from "./modules/export/pdf-export";

export default class MermaidMaestroPlugin extends Plugin {
	settings: MermaidMaestroSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();

		// Initialize global MutationObserver for Mermaid diagram detection.
		// Note: registerMarkdownPostProcessor does NOT work for Mermaid —
		// Obsidian renders Mermaid asynchronously outside the post-processor pipeline.
		initMermaidObserver(this);

		// Settings tab
		this.addSettingTab(new MermaidMaestroSettingTab(this.app, this));
	}

	onunload() {
		// Cleanup is handled by plugin.register() callbacks in post-processor
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		// Clamp pngScale to valid range in case of manual data.json edits
		this.settings.pngScale = Math.max(1, Math.min(4, this.settings.pngScale));
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
	 * Uses the shared rasterization utility with canvas size guard.
	 */
	private async exportPng(svg: SVGSVGElement, background: "transparent" | "white"): Promise<void> {
		try {
			const canvas = await rasterizeSvgToCanvas(svg, this.settings.pngScale, background);

			// Use Electron native clipboard via canvas data URL — most reliable
			// path for large images on desktop (avoids Blob/Buffer truncation)
			let clipboardOk = false;
			if (Platform.isDesktop) {
				try {
					const electron = require("electron");
					const pngDataUrl = canvas.toDataURL("image/png");
					const nativeImg = electron.nativeImage.createFromDataURL(pngDataUrl);
					electron.clipboard.writeImage(nativeImg);
					clipboardOk = true;
				} catch {
					// Not in Electron — fall through to web API
				}
			}

			if (!clipboardOk) {
				const blob = await new Promise<Blob>((resolve, reject) => {
					canvas.toBlob(
						(b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
						"image/png"
					);
				});
				await copyPngToClipboard(blob);
			}

			releaseCanvas(canvas);
			new Notice("PNG copied to clipboard!");
		} catch (err) {
			console.error("Mermaid Maestro: PNG export failed", err);
			new Notice(`PNG export failed: ${err instanceof Error ? err.message : "Unknown error"}`);
		}
	}

	/**
	 * Export an SVG to the clipboard as SVG markup.
	 */
	private async exportSvg(svg: SVGSVGElement): Promise<void> {
		try {
			const dims = getSvgDimensions(svg);

			if (dims.width <= 0 || dims.height <= 0) {
				new Notice("Cannot export: diagram has zero dimensions.");
				return;
			}

			const clone = cloneSvgWithStyles(svg);
			clone.removeAttribute("style");
			clone.setAttribute("width", String(Math.ceil(dims.width)));
			clone.setAttribute("height", String(Math.ceil(dims.height)));
			const svgString = serializeSvg(clone);
			await copyTextToClipboard(svgString);
			new Notice("SVG copied to clipboard!");
		} catch (err) {
			console.error("Mermaid Maestro: SVG export failed", err);
			new Notice(`SVG export failed: ${err instanceof Error ? err.message : "Unknown error"}`);
		}
	}

	/**
	 * Extract and copy the Mermaid source code from the rendered container.
	 */
	private async exportSource(mermaidContainer: HTMLElement): Promise<void> {
		try {
			const source =
				mermaidContainer.getAttribute("data-mermaid-source") ??
				mermaidContainer.getAttribute("data-source") ??
				this.extractSourceFromDom(mermaidContainer);

			if (!source) {
				new Notice("Could not find Mermaid source code.");
				return;
			}

			await copyTextToClipboard(source);
			new Notice("Mermaid source copied to clipboard!");
		} catch (err) {
			console.error("Mermaid Maestro: Source export failed", err);
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
