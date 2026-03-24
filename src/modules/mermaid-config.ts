import { Notice, Platform, Plugin } from "obsidian";
import type { MermaidMaestroSettings } from "../settings";

/** Minimal typing for the parts of the Mermaid API we use. */
interface MermaidGlobal {
	initialize: (config: Record<string, unknown>) => void;
	registerLayoutLoaders?: (loaders: unknown[]) => void;
	mermaidAPI?: {
		defaultConfig?: { maxEdges?: number };
		updateSiteConfig?: (config: Record<string, unknown>) => void;
	};
	version?: string;
}

/** Access Obsidian's bundled Mermaid instance from the global scope. */
function getMermaid(): MermaidGlobal | undefined {
	return (globalThis as Record<string, unknown>).mermaid as MermaidGlobal | undefined;
}

/**
 * Detect the Mermaid.js version bundled with Obsidian.
 * Falls back to feature-probing when the version string isn't exposed.
 */
export function detectMermaidVersion(): string {
	const m = getMermaid();
	if (!m) return "not found";
	if (m.version) return m.version;
	// Feature probe: registerLayoutLoaders was added in v11
	if (typeof m.registerLayoutLoaders === "function") return "11+ (exact version unknown)";
	return "10.x (exact version unknown)";
}

/**
 * Apply plugin settings to Obsidian's Mermaid instance.
 * Must be called early — ideally before diagrams render.
 *
 * Uses updateSiteConfig (merges without reset) when available,
 * falling back to initialize() for older Mermaid versions.
 */
export function applyMermaidConfig(settings: MermaidMaestroSettings): void {
	const m = getMermaid();
	if (!m) {
		console.warn("Mermaid Maestro: window.mermaid not available — cannot configure Mermaid.");
		return;
	}

	// Always apply full config to ensure our settings take effect even if
	// another plugin has changed Mermaid's defaults.
	const config: Record<string, unknown> = {
		maxEdges: settings.maxEdges,
		theme: settings.defaultTheme,
	};

	try {
		// Prefer updateSiteConfig — merges config without resetting Mermaid's
		// internal state (registered diagram types, layout engines, etc.).
		if (typeof m.mermaidAPI?.updateSiteConfig === "function") {
			m.mermaidAPI.updateSiteConfig(config);
		} else {
			m.initialize(config);
		}
	} catch (err) {
		console.error("Mermaid Maestro: Failed to configure Mermaid", err);
	}
}

/**
 * Load and register the ELK layout engine with Mermaid.
 * The ELK bundle is shipped as a separate file (elk-layout.js) to keep
 * the main plugin bundle small (~1.5 MB vs ~5 MB with ELK inlined).
 * It is only loaded when the user enables the ELK setting.
 */
export async function registerElkLayout(plugin: Plugin): Promise<boolean> {
	const m = getMermaid();
	if (!m) {
		console.warn("Mermaid Maestro: window.mermaid not available — cannot register ELK.");
		return false;
	}

	if (typeof m.registerLayoutLoaders !== "function") {
		new Notice("ELK layout requires Mermaid v11+. Your Obsidian version may be too old.");
		return false;
	}

	// ELK uses elkjs which requires Node.js — not available on mobile
	if (Platform.isMobile) {
		new Notice("ELK layout engine is not available on mobile.");
		return false;
	}

	try {
		// Load ELK from the separate bundle shipped alongside main.js.
		const pluginDir = plugin.manifest.dir;
		if (!pluginDir) throw new Error("Cannot determine plugin directory");

		const vaultBasePath = (plugin.app.vault.adapter as { basePath?: string }).basePath;
		if (!vaultBasePath) throw new Error("Cannot determine vault base path");

		// Construct and validate the ELK bundle path to prevent traversal
		const expectedBase = `${vaultBasePath}/${pluginDir}`;
		const elkPath = `${expectedBase}/elk-layout.js`;

		// Defensive: ensure resolved path stays within the plugin directory.
		// Node's require.resolve would canonicalize, but we manually check
		// that the constructed path doesn't escape via ../ in pluginDir.
		const normalizedElk = require("path").resolve(elkPath) as string;
		const normalizedBase = require("path").resolve(expectedBase) as string;
		if (!normalizedElk.startsWith(normalizedBase)) {
			throw new Error("ELK path escapes plugin directory — refusing to load");
		}

		// Synchronous require() — blocks briefly (~50ms) on first load.
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const elkModule = require(normalizedElk);
		const layouts = elkModule.default ?? elkModule;
		const loaders = Array.isArray(layouts) ? layouts : [layouts];
		m.registerLayoutLoaders(loaders);
		return true;
	} catch (err) {
		console.error("Mermaid Maestro: Failed to load ELK layout engine", err);
		new Notice(`ELK layout engine failed to load: ${err instanceof Error ? err.message : "Unknown error"}`);
		return false;
	}
}
