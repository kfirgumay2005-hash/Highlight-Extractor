import {
	App,
	DropdownComponent,
	PluginSettingTab,
	Setting,
	SettingDefinitionItem,
	TFolder,
} from 'obsidian';
import HighlightsExtractorPlugin from './main';
import {
	buildSettingDefinitions,
	DESC,
	OPTIONS,
	WEEKDAY_NAMES,
} from './settings-definitions';

export interface WeekdayTemplateRule {
	/** 0 = Sunday ... 6 = Saturday */
	day: number;
	templatePath: string;
}

export interface HighlightsExtractorSettings {
	outputLocation: 'new-note' | 'active-note';
	dailyNotesFolder: string;
	dailyNotesFormat: string;
	outputFormat: 'bullet' | 'quote' | 'date';
	requiredTag: string;
	includeHeader: boolean;
	extractContext: 'exact' | 'sentence' | 'paragraph';
	weeklyDateRangeType: 'rolling' | 'calendar';
	monthlyDateRangeType: 'rolling' | 'calendar';
	quickFormatting: 'preserve' | 'plain';
	enableWeekdayTemplates: boolean;
	weekdayTemplates: WeekdayTemplateRule[];
}

export const DEFAULT_SETTINGS: HighlightsExtractorSettings = {
	outputLocation: 'new-note',
	dailyNotesFolder: '',
	dailyNotesFormat: 'YYYY-MM-DD',
	outputFormat: 'bullet',
	requiredTag: '',
	includeHeader: true,
	extractContext: 'exact',
	weeklyDateRangeType: 'rolling',
	monthlyDateRangeType: 'rolling',
	quickFormatting: 'preserve',
	enableWeekdayTemplates: false,
	weekdayTemplates: [],
};

const TEMPLATE_DATALIST_ID = 'highlights-extractor-template-notes';

type OptionKey = keyof typeof OPTIONS;

export class HighlightsExtractorSettingTab extends PluginSettingTab {
	plugin: HighlightsExtractorPlugin;

	constructor(app: App, plugin: HighlightsExtractorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	// ---------- Declarative settings (Obsidian 1.13+) ----------

	getSettingDefinitions(): SettingDefinitionItem[] {
		return buildSettingDefinitions(this);
	}

	getControlValue(key: string): unknown {
		return this.plugin.settings[key as keyof HighlightsExtractorSettings];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === 'dailyNotesFolder' && typeof value === 'string') {
			// The rest of the plugin uses '' for the vault root and no trailing slash.
			value = value.replace(/\/+$/, '');
		}
		(this.plugin.settings as unknown as Record<string, unknown>)[key] =
			value;
		await this.plugin.saveSettings();
	}

	// ---------- Legacy imperative settings (Obsidian < 1.13) ----------

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Highlights & Bold Extractor')
			.setHeading();

		this.addLegacyDropdown(containerEl, 'Output Location', 'outputLocation');

		new Setting(containerEl)
			.setName('Include Summary Header')
			.setDesc(DESC.includeHeader)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeHeader)
					.onChange((value) => {
						this.plugin.settings.includeHeader = value;
						void this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Daily Notes & Date Ranges')
			.setHeading();

		const allFolders = this.app.vault
			.getAllLoadedFiles()
			.filter((f): f is TFolder => f instanceof TFolder);

		new Setting(containerEl)
			.setName('Daily Notes Folder')
			.setDesc(DESC.dailyNotesFolder)
			.addDropdown((dropdown) => {
				dropdown.addOption('', 'Vault Root (/)');

				allFolders.forEach((folder) => {
					if (folder.path !== '/') {
						dropdown.addOption(folder.path, folder.path);
					}
				});

				dropdown.setValue(this.plugin.settings.dailyNotesFolder);
				dropdown.onChange((value) => {
					this.plugin.settings.dailyNotesFolder = value;
					void this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Daily Notes Date Format')
			.setDesc(DESC.dailyNotesFormat)
			.addText((text) =>
				text
					.setPlaceholder('DD-MM-YYYY')
					.setValue(this.plugin.settings.dailyNotesFormat)
					.onChange((value) => {
						this.plugin.settings.dailyNotesFormat = value;
						void this.plugin.saveSettings();
					}),
			);

		this.addLegacyDropdown(
			containerEl,
			'Weekly Date Range Mode',
			'weeklyDateRangeType',
		);
		this.addLegacyDropdown(
			containerEl,
			'Monthly Date Range Mode',
			'monthlyDateRangeType',
		);

		this.displayWeekdayTemplates(containerEl);

		new Setting(containerEl).setName('Formatting & Filters').setHeading();

		this.addLegacyDropdown(
			containerEl,
			'Extraction Context',
			'extractContext',
		);
		this.addLegacyDropdown(
			containerEl,
			'Quick Commands Formatting',
			'quickFormatting',
		);
		this.addLegacyDropdown(containerEl, 'Output Format', 'outputFormat');

		new Setting(containerEl)
			.setName('Required Tag Filter')
			.setDesc(DESC.requiredTag)
			.addText((text) =>
				text
					.setPlaceholder('#Daily')
					.setValue(this.plugin.settings.requiredTag)
					.onChange((value) => {
						this.plugin.settings.requiredTag = value;
						void this.plugin.saveSettings();
					}),
			);
	}

	private addLegacyDropdown(
		containerEl: HTMLElement,
		name: string,
		key: OptionKey,
	): void {
		new Setting(containerEl)
			.setName(name)
			.setDesc(DESC[key])
			.addDropdown((dropdown: DropdownComponent) =>
				dropdown
					.addOptions(OPTIONS[key])
					.setValue(this.plugin.settings[key])
					.onChange((value: string) => {
						void this.setControlValue(key, value);
					}),
			);
	}

	private displayWeekdayTemplates(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Weekday Templates').setHeading();

		// Native autocomplete list of note paths for the template inputs.
		// (Replaces AbstractInputSuggest, which requires a newer minAppVersion.)
		const datalist = containerEl.createEl('datalist');
		datalist.id = TEMPLATE_DATALIST_ID;
		this.app.vault.getMarkdownFiles().forEach((file) => {
			datalist.createEl('option', { value: file.path });
		});

		new Setting(containerEl)
			.setName('Enable weekday templates')
			.setDesc(DESC.enableWeekdayTemplates)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableWeekdayTemplates)
					.onChange((value) => {
						this.plugin.settings.enableWeekdayTemplates = value;
						void this.plugin.saveSettings();
					}),
			);

		this.plugin.settings.weekdayTemplates.forEach((rule, index) => {
			new Setting(containerEl)
				.setName(`Rule ${index + 1}`)
				.addDropdown((dropdown) => {
					WEEKDAY_NAMES.forEach((name, i) => {
						dropdown.addOption(i.toString(), name);
					});
					dropdown.setValue(rule.day.toString());
					dropdown.onChange((value) => {
						rule.day = parseInt(value);
						void this.plugin.saveSettings();
					});
				})
				.addText((text) => {
					text.setPlaceholder('Template note path')
						.setValue(rule.templatePath)
						.onChange((value) => {
							rule.templatePath = value.trim();
							void this.plugin.saveSettings();
						});
					text.inputEl.setAttribute('list', TEMPLATE_DATALIST_ID);
				})
				.addExtraButton((btn) =>
					btn
						.setIcon('trash')
						.setTooltip('Delete rule')
						.onClick(() => {
							this.plugin.settings.weekdayTemplates.splice(
								index,
								1,
							);
							void this.plugin.saveSettings().then(() => {
								this.display();
							});
						}),
				);
		});

		new Setting(containerEl).addButton((btn) =>
			btn
				.setButtonText('Add weekday rule')
				.setCta()
				.onClick(() => {
					this.plugin.settings.weekdayTemplates.push({
						day: 6,
						templatePath: '',
					});
					void this.plugin.saveSettings().then(() => {
						this.display();
					});
				}),
		);
	}
}
