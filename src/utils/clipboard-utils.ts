import { Platform } from "obsidian";

/**
 * Copy a PNG blob to the clipboard via Web API.
 * Used as fallback when Electron native clipboard is not available (e.g. mobile).
 */
export async function copyPngToClipboard(blob: Blob): Promise<void> {
	try {
		await navigator.clipboard.write([
			new ClipboardItem({ "image/png": blob }),
		]);
	} catch {
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
