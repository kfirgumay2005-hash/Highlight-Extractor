import { App, PluginSettingTab, Setting, TFolder } from 'obsidian';
import HighlightsExtractorPlugin from './main';

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
};

export class HighlightsExtractorSettingTab extends PluginSettingTab {
	plugin: HighlightsExtractorPlugin;

	constructor(app: App, plugin: HighlightsExtractorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', {
			text: 'Highlights & Bold Extractor - Settings',
		});

		new Setting(containerEl)
			.setName('Output Location')
			.setDesc('Choose where the extracted text will be generated.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('new-note', 'Create New Note')
					.addOption('active-note', 'Append to Active Note')
					.setValue(this.plugin.settings.outputLocation)
					.onChange(async (value: string) => {
						this.plugin.settings.outputLocation = value as
							| 'new-note'
							| 'active-note';
						await this.plugin.saveSettings();
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
					.onChange(async (value) => {
						this.plugin.settings.includeHeader = value;
						await this.plugin.saveSettings();
					}),
			);

		containerEl.createEl('h3', {
			text: 'Daily Notes & Date Range Settings',
		});

		const allFolders = this.app.vault
			.getAllLoadedFiles()
			.filter((f) => f instanceof TFolder) as TFolder[];

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
				dropdown.onChange(async (value) => {
					this.plugin.settings.dailyNotesFolder = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Daily Notes Date Format')
			.setDesc(
				'Format of your daily notes file names (e.g. DD-MM-YYYY or YYYY-MM-DD). Used to identify daily files for the Timeframe commands.',
			)
			.addText((text) =>
				text
					.setPlaceholder('DD-MM-YYYY')
					.setValue(this.plugin.settings.dailyNotesFormat)
					.onChange(async (value) => {
						this.plugin.settings.dailyNotesFormat = value;
						await this.plugin.saveSettings();
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
					.onChange(async (value: string) => {
						this.plugin.settings.weeklyDateRangeType = value as
							| 'rolling'
							| 'calendar';
						await this.plugin.saveSettings();
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
					.onChange(async (value: string) => {
						this.plugin.settings.monthlyDateRangeType = value as
							| 'rolling'
							| 'calendar';
						await this.plugin.saveSettings();
					}),
			);

		containerEl.createEl('h3', { text: 'Formatting & Filters' });

		new Setting(containerEl)
			.setName('Extraction Context')
			.setDesc('Default scope when extracting highlights/bold text.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('exact', 'Only Highlighted / Bold Text')
					.addOption('sentence', 'Full Sentence containing match')
					.addOption('paragraph', 'Full Paragraph containing match')
					.setValue(this.plugin.settings.extractContext)
					.onChange(async (value: string) => {
						this.plugin.settings.extractContext = value as
							| 'exact'
							| 'sentence'
							| 'paragraph';
						await this.plugin.saveSettings();
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
					.onChange(async (value: string) => {
						this.plugin.settings.outputFormat = value as
							| 'bullet'
							| 'quote'
							| 'date';
						await this.plugin.saveSettings();
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
					.onChange(async (value) => {
						this.plugin.settings.requiredTag = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
