import { Platform } from "obsidian";

/**
 * Copy a PNG blob to the clipboard.
 * On desktop (Electron), uses the native clipboard API which handles
 * large images reliably. On mobile, falls back to Web Share API.
 */
export async function copyPngToClipboard(blob: Blob): Promise<void> {
	// Desktop: use Electron's native clipboard for reliable large image support
	if (Platform.isDesktop) {
		try {
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const electron = require("electron");
			const buffer = Buffer.from(await blob.arrayBuffer());
			const image = electron.nativeImage.createFromBuffer(buffer);
			electron.clipboard.writeImage(image);
			return;
		} catch (e) {
			console.warn("Mermaid Maestro: Electron clipboard failed, trying web API", e);
			// Fall through to web API
		}
	}

	try {
		await navigator.clipboard.write([
			new ClipboardItem({ "image/png": blob }),
		]);
	} catch {
		// Fallback: try Web Share API on mobile
		if (Platform.isMobile && navigator.share) {
			const file = new File([blob], "mermaid-diagram.png", { type: "image/png" });
			await navigator.share({ files: [file] });
		} else {
			throw new Error("Clipboard write not supported. Try the file export option.");
		}
	}
}

/**
 * Copy text to the clipboard.
 */
export async function copyTextToClipboard(text: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(text);
	} catch {
		// Fallback: try Web Share API on mobile
		if (Platform.isMobile && navigator.share) {
			await navigator.share({ text });
		} else {
			throw new Error("Clipboard write not supported.");
		}
	}
}

/**
 * Convert an SVG string to a base64 data URL.
 * This avoids canvas tainting issues that URL.createObjectURL can cause
 * when the SVG contains external references (fonts, images).
 */
export function svgToBase64DataUrl(svgString: string): string {
	const bytes = new TextEncoder().encode(svgString);
	const base64 = btoa(
		Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")
	);
	return `data:image/svg+xml;base64,${base64}`;
}
