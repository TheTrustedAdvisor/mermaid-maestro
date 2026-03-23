import { Menu, Notice, Plugin } from "obsidian";
import {
	DEFAULT_SETTINGS,
	MermaidOneInAllSettingTab,
	type MermaidOneInAllSettings,
} from "./settings";
import { initMermaidObserver } from "./post-processor";
import { cloneSvgWithStyles, serializeSvg } from "./utils/svg-utils";
import { copyPngToClipboard, copyTextToClipboard, svgToBase64DataUrl } from "./utils/clipboard-utils";
import { MermaidLightboxModal } from "./modules/lightbox";
import { exportPdf } from "./modules/export/pdf-export";

export default class MermaidOneInAllPlugin extends Plugin {
	settings: MermaidOneInAllSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();

		console.log(`Mermaid Maestro v${this.manifest.version} loaded`);

		// Initialize global MutationObserver for Mermaid diagram detection.
		// Note: registerMarkdownPostProcessor does NOT work for Mermaid —
		// Obsidian renders Mermaid asynchronously outside the post-processor pipeline.
		initMermaidObserver(this);

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
			const scale = this.settings.pngScale;

			// Read the original viewBox — Mermaid sets this to cover the full diagram
			const vbAttr = svg.getAttribute("viewBox");
			const vbParts = vbAttr ? vbAttr.trim().split(/[\s,]+/).map(Number) : null;
			const vbW = vbParts && vbParts.length === 4 ? vbParts[2] : svg.getBBox().width;
			const vbH = vbParts && vbParts.length === 4 ? vbParts[3] : svg.getBBox().height;

			console.log("Mermaid Maestro PNG Export:", { viewBox: vbAttr, vbW, vbH, scale });

			const clone = cloneSvgWithStyles(svg);

			// Remove auto-fit CSS, keep viewBox unchanged, set width/height to
			// the scaled target resolution so the browser rasterises vectors at
			// full quality without needing ctx.scale() upscaling.
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

			console.log("Mermaid Maestro PNG Export: img loaded", {
				naturalWidth: img.naturalWidth,
				naturalHeight: img.naturalHeight,
			});

			const canvas = document.createElement("canvas");
			canvas.width = img.naturalWidth;
			canvas.height = img.naturalHeight;

			const ctx = canvas.getContext("2d");
			if (!ctx) throw new Error("Could not get canvas context");

			if (background === "white") {
				ctx.fillStyle = "#ffffff";
				ctx.fillRect(0, 0, canvas.width, canvas.height);
			}

			ctx.drawImage(img, 0, 0);

			// Try Electron native clipboard via canvas data URL (most reliable on desktop)
			let clipboardOk = false;
			try {
				const electron = require("electron");
				const pngDataUrl = canvas.toDataURL("image/png");
				const nativeImg = electron.nativeImage.createFromDataURL(pngDataUrl);
				electron.clipboard.writeImage(nativeImg);
				clipboardOk = true;
				console.log("Mermaid Maestro: wrote to clipboard via Electron nativeImage", {
					isEmpty: nativeImg.isEmpty(),
					size: nativeImg.getSize(),
				});
			} catch (e) {
				console.warn("Mermaid Maestro: Electron clipboard failed", e);
			}

			// Fallback: web clipboard API via blob
			if (!clipboardOk) {
				const blob = await new Promise<Blob>((resolve, reject) => {
					canvas.toBlob(
						(b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
						"image/png"
					);
				});
				await copyPngToClipboard(blob);
			}

			// DEBUG: also download the PNG file so we can inspect it directly
			const debugBlob = await new Promise<Blob>((resolve, reject) => {
				canvas.toBlob(
					(b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
					"image/png"
				);
			});
			const debugUrl = URL.createObjectURL(debugBlob);
			const a = document.createElement("a");
			a.href = debugUrl;
			a.download = `mermaid-debug-${scale}x.png`;
			a.click();
			URL.revokeObjectURL(debugUrl);

			new Notice(`PNG copied + downloaded (${img.naturalWidth}×${img.naturalHeight})`);
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
			const vbAttr = svg.getAttribute("viewBox");
			const vbParts = vbAttr ? vbAttr.trim().split(/[\s,]+/).map(Number) : null;
			const vbW = vbParts && vbParts.length === 4 ? vbParts[2] : svg.getBBox().width;
			const vbH = vbParts && vbParts.length === 4 ? vbParts[3] : svg.getBBox().height;

			const clone = cloneSvgWithStyles(svg);
			clone.removeAttribute("style");
			clone.setAttribute("width", String(Math.ceil(vbW)));
			clone.setAttribute("height", String(Math.ceil(vbH)));
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
