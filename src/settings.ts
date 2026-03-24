import { App, Notice, normalizePath, PluginSettingTab, Setting } from "obsidian";
import type MermaidMaestroPlugin from "./main";
import { detectMermaidVersion } from "./modules/mermaid-config";

export type MermaidTheme = "default" | "dark" | "forest" | "neutral" | "base";

export interface MermaidMaestroSettings {
	autoFitEnabled: boolean;
	lightboxEnabled: boolean;
	contextMenuEnabled: boolean;
	toolbarEnabled: boolean;
	pngScale: number;
	exportFolder: string;
	// Mermaid engine settings
	elkEnabled: boolean;
	maxEdges: number;
	defaultTheme: MermaidTheme;
}

export const DEFAULT_SETTINGS: MermaidMaestroSettings = {
	autoFitEnabled: true,
	lightboxEnabled: true,
	contextMenuEnabled: true,
	toolbarEnabled: true,
	pngScale: 2,
	exportFolder: "mermaid-exports",
	elkEnabled: false,
	maxEdges: 500,
	defaultTheme: "default",
};

export class MermaidMaestroSettingTab extends PluginSettingTab {
	plugin: MermaidMaestroPlugin;

	constructor(app: App, plugin: MermaidMaestroPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ── Diagram Enhancement ──────────────────────────────────

		new Setting(containerEl).setName("Diagram enhancement").setHeading();

		new Setting(containerEl)
			.setName("Auto-fit")
			.setDesc("Automatically scale diagrams to fit the container width.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoFitEnabled)
					.onChange(async (value) => {
						this.plugin.settings.autoFitEnabled = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Lightbox")
			.setDesc("Click on a diagram to open it in a large overlay with pan and zoom.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.lightboxEnabled)
					.onChange(async (value) => {
						this.plugin.settings.lightboxEnabled = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Context menu")
			.setDesc("Right-click on a diagram to access export options.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.contextMenuEnabled)
					.onChange(async (value) => {
						this.plugin.settings.contextMenuEnabled = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Hover toolbar")
			.setDesc("Show a small toolbar with quick actions when hovering over a diagram.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.toolbarEnabled)
					.onChange(async (value) => {
						this.plugin.settings.toolbarEnabled = value;
						await this.plugin.saveSettings();
					})
			);

		// ── Export ────────────────────────────────────────────────

		new Setting(containerEl).setName("Export").setHeading();

		new Setting(containerEl)
			.setName("PNG export scale")
			.setDesc("Resolution multiplier for PNG export (2x recommended for high-resolution displays).")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("1", "1x")
					.addOption("2", "2x")
					.addOption("3", "3x")
					.addOption("4", "4x")
					.setValue(String(this.plugin.settings.pngScale))
					.onChange(async (value) => {
						this.plugin.settings.pngScale = parseInt(value, 10);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Export folder")
			.setDesc(
				"Folder inside the vault for 'save as file' exports. " +
				"Created automatically when first used."
			)
			.addText((text) =>
				text
					.setPlaceholder("Mermaid-exports")
					.setValue(this.plugin.settings.exportFolder)
					.onChange(async (value) => {
						const folder = normalizePath(value.trim() || "mermaid-exports");
						if (folder.startsWith("..") || folder.includes("/..") || folder.startsWith("/")) {
							new Notice("Export folder must be a relative path inside the vault.");
							return;
						}
						this.plugin.settings.exportFolder = folder;
						await this.plugin.saveSettings();
					})
			);

		// ── Mermaid Engine ───────────────────────────────────────

		new Setting(containerEl).setName("Mermaid engine").setHeading();

		const version = detectMermaidVersion();
		new Setting(containerEl)
			.setName("Mermaid version")
			.setDesc(`Detected: ${version}`)
			.setDisabled(true);

		new Setting(containerEl)
			.setName("Elk layout engine")
			.setDesc(
				"Enable the Elk layout engine for improved diagram layouts. " +
				"Use 'flowchart-elk' or add 'config: layout: elk' to your diagrams. " +
				"Requires Mermaid v11+, reload after changing."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.elkEnabled)
					.onChange(async (value) => {
						this.plugin.settings.elkEnabled = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Max edges")
			.setDesc(
				"Maximum number of edges allowed in a diagram (default: 500). " +
				"Increase for large architecture diagrams, reload after changing."
			)
			.addText((text) =>
				text
					.setPlaceholder("500")
					.setValue(String(this.plugin.settings.maxEdges))
					.onChange(async (value) => {
						const parsed = parseInt(value, 10);
						if (!isNaN(parsed) && parsed > 0) {
							this.plugin.settings.maxEdges = Math.min(50000, parsed);
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName("Default theme")
			.setDesc(
				"Global Mermaid theme for all diagrams. " +
				"Individual diagrams can override this with %%{init: {'theme': '...'}}%% directives. " +
				"Reload after changing."
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("default", "Default")
					.addOption("dark", "Dark")
					.addOption("forest", "Forest")
					.addOption("neutral", "Neutral")
					.addOption("base", "Base (for custom colors)")
					.setValue(this.plugin.settings.defaultTheme)
					.onChange(async (value) => {
						this.plugin.settings.defaultTheme = value as MermaidTheme;
						await this.plugin.saveSettings();
					})
			);
	}
}
