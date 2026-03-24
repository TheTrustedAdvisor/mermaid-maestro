import { App, PluginSettingTab, Setting } from "obsidian";
import type MermaidMaestroPlugin from "./main";

export interface MermaidMaestroSettings {
	autoFitEnabled: boolean;
	lightboxEnabled: boolean;
	contextMenuEnabled: boolean;
	toolbarEnabled: boolean;
	pngScale: number;
}

export const DEFAULT_SETTINGS: MermaidMaestroSettings = {
	autoFitEnabled: true,
	lightboxEnabled: true,
	contextMenuEnabled: true,
	toolbarEnabled: true,
	pngScale: 2,
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

		containerEl.createEl("h2", { text: "Mermaid Maestro Settings" });

		new Setting(containerEl)
			.setName("Auto-Fit")
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
			.setName("Context Menu")
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
			.setName("Hover Toolbar")
			.setDesc("Show a small toolbar with quick actions when hovering over a diagram.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.toolbarEnabled)
					.onChange(async (value) => {
						this.plugin.settings.toolbarEnabled = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("PNG Export Scale")
			.setDesc("Resolution multiplier for PNG export (2x recommended for Retina displays).")
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

	}
}
