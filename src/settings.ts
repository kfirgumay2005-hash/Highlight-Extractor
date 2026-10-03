import { App, PluginSettingTab, Setting, TFolder } from 'obsidian';
import HighlightsExtractorPlugin from './main';

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

const WEEKDAY_NAMES = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
];

const TEMPLATE_DATALIST_ID = 'highlights-extractor-template-notes';

export class HighlightsExtractorSettingTab extends PluginSettingTab {
	plugin: HighlightsExtractorPlugin;

	constructor(app: App, plugin: HighlightsExtractorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): Record<string, unknown> {
		return {};
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Highlights & Bold Extractor')
			.setHeading();

		new Setting(containerEl)
			.setName('Output Location')
			.setDesc('Choose where the extracted text will be generated.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('new-note', 'Create New Note')
					.addOption('active-note', 'Append to Active Note')
					.setValue(this.plugin.settings.outputLocation)
					.onChange((value: string) => {
						this.plugin.settings.outputLocation = value as
							| 'new-note'
							| 'active-note';
						void this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Include Summary Header')
			.setDesc(
				'Include title and "Generated on: YYYY-MM-DD" header at the top of generated summaries.',
			)
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
			.setDesc('Select the folder where your daily notes are stored.')
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
			.setDesc(
				'Format of your daily notes file names (e.g. DD-MM-YYYY or YYYY-MM-DD). Used to identify daily files for the Timeframe commands and for weekday templates.',
			)
			.addText((text) =>
				text
					.setPlaceholder('DD-MM-YYYY')
					.setValue(this.plugin.settings.dailyNotesFormat)
					.onChange((value) => {
						this.plugin.settings.dailyNotesFormat = value;
						void this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Weekly Date Range Mode')
			.setDesc('Choose how the "Last Week" date range is calculated.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('rolling', 'Rolling Days (past 7 days)')
					.addOption('calendar', 'Previous Calendar Week')
					.setValue(this.plugin.settings.weeklyDateRangeType)
					.onChange((value: string) => {
						this.plugin.settings.weeklyDateRangeType = value as
							| 'rolling'
							| 'calendar';
						void this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Monthly Date Range Mode')
			.setDesc('Choose how the "Last Month" date range is calculated.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('rolling', 'Rolling Days (past 30 days)')
					.addOption('calendar', 'Previous Calendar Month')
					.setValue(this.plugin.settings.monthlyDateRangeType)
					.onChange((value: string) => {
						this.plugin.settings.monthlyDateRangeType = value as
							| 'rolling'
							| 'calendar';
						void this.plugin.saveSettings();
					}),
			);

		this.displayWeekdayTemplates(containerEl);

		new Setting(containerEl).setName('Formatting & Filters').setHeading();

		new Setting(containerEl)
			.setName('Extraction Context')
			.setDesc('Default scope when extracting highlights/bold text.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('exact', 'Only Highlighted / Bold Text')
					.addOption('sentence', 'Full Sentence containing match')
					.addOption('paragraph', 'Full Paragraph containing match')
					.setValue(this.plugin.settings.extractContext)
					.onChange((value: string) => {
						this.plugin.settings.extractContext = value as
							| 'exact'
							| 'sentence'
							| 'paragraph';
						void this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Quick Commands Formatting')
			.setDesc(
				'Choose whether to remove formatting (like == and **) when using quick extraction commands.',
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption('preserve', 'Preserve Markup')
					.addOption('plain', 'Remove Formatting')
					.setValue(this.plugin.settings.quickFormatting)
					.onChange((value: string) => {
						this.plugin.settings.quickFormatting = value as
							| 'preserve'
							| 'plain';
						void this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Output Format')
			.setDesc(
				'Choose how extracted text will be formatted in the summary note.',
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption('bullet', 'Bullet Points (- item)')
					.addOption('quote', 'Quote Blocks (> item)')
					.addOption('date', 'Date Prefix (YYYY-MM-DD: item)')
					.setValue(this.plugin.settings.outputFormat)
					.onChange((value: string) => {
						this.plugin.settings.outputFormat = value as
							| 'bullet'
							| 'quote'
							| 'date';
						void this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Required Tag Filter')
			.setDesc(
				'Only extract from notes containing this tag (e.g., #Daily). Leave blank to disable.',
			)
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
			.setDesc(
				'When a new daily note is created, use a different template for specific weekdays instead of your default daily note template. The weekday is taken from the note name (see Daily Notes Date Format).',
			)
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
					WEEKDAY_NAMES.forEach((name, i) =>
						dropdown.addOption(i.toString(), name),
					);
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
