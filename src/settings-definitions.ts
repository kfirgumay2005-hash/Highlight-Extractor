import type { SettingDefinitionItem } from 'obsidian';
import type HighlightsExtractorPlugin from './main';

/** Dropdown options shared by the declarative and legacy settings UIs. */
export const OPTIONS = {
	outputLocation: {
		'new-note': 'Create New Note',
		'active-note': 'Append to Active Note',
	},
	weeklyDateRangeType: {
		rolling: 'Rolling Days (past 7 days)',
		calendar: 'Previous Calendar Week',
	},
	monthlyDateRangeType: {
		rolling: 'Rolling Days (past 30 days)',
		calendar: 'Previous Calendar Month',
	},
	extractContext: {
		exact: 'Only Highlighted / Bold Text',
		sentence: 'Full Sentence containing match',
		paragraph: 'Full Paragraph containing match',
	},
	quickFormatting: {
		preserve: 'Preserve Markup',
		plain: 'Remove Formatting',
	},
	outputFormat: {
		bullet: 'Bullet Points (- item)',
		quote: 'Quote Blocks (> item)',
		date: 'Date Prefix (YYYY-MM-DD: item)',
	},
} satisfies Record<string, Record<string, string>>;

export const DESC = {
	outputLocation: 'Choose where the extracted text will be generated.',
	includeHeader:
		'Include title and "Generated on: YYYY-MM-DD" header at the top of generated summaries.',
	dailyNotesFolder: 'Select the folder where your daily notes are stored.',
	dailyNotesFormat:
		'Format of your daily notes file names (e.g. DD-MM-YYYY or YYYY-MM-DD). Used to identify daily files for the Timeframe commands and for weekday templates.',
	weeklyDateRangeType: 'Choose how the "Last Week" date range is calculated.',
	monthlyDateRangeType:
		'Choose how the "Last Month" date range is calculated.',
	enableWeekdayTemplates:
		'When a new daily note is created, use a different template for specific weekdays instead of your default daily note template. The weekday is taken from the note name (see Daily Notes Date Format).',
	extractContext: 'Default scope when extracting highlights/bold text.',
	quickFormatting:
		'Choose whether to remove formatting (like == and **) when using quick extraction commands.',
	outputFormat:
		'Choose how extracted text will be formatted in the summary note.',
	requiredTag:
		'Only extract from notes containing this tag (e.g., #Daily). Leave blank to disable.',
};

export const WEEKDAY_NAMES = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
];

/** Minimal surface of the settings tab needed to build definitions. */
interface SettingsTabHost {
	plugin: HighlightsExtractorPlugin;
	update(): void;
}

/**
 * Declarative settings (Obsidian 1.13+). Makes every setting show up in
 * Obsidian's settings search. Older versions fall back to `display()`.
 */
export function buildSettingDefinitions(
	tab: SettingsTabHost,
): SettingDefinitionItem[] {
	const plugin = tab.plugin;
	const settings = plugin.settings;

	const saveAndRebuild = () => {
		void plugin.saveSettings().then(() => tab.update());
	};

	return [
		{
			type: 'group',
			heading: 'Highlights & Bold Extractor',
			items: [
				{
					name: 'Output Location',
					desc: DESC.outputLocation,
					control: {
						type: 'dropdown',
						key: 'outputLocation',
						options: OPTIONS.outputLocation,
					},
				},
				{
					name: 'Include Summary Header',
					desc: DESC.includeHeader,
					control: { type: 'toggle', key: 'includeHeader' },
				},
			],
		},
		{
			type: 'group',
			heading: 'Daily Notes & Date Ranges',
			items: [
				{
					name: 'Daily Notes Folder',
					desc: DESC.dailyNotesFolder,
					control: {
						type: 'folder',
						key: 'dailyNotesFolder',
						placeholder: 'Vault Root (/)',
					},
				},
				{
					name: 'Daily Notes Date Format',
					desc: DESC.dailyNotesFormat,
					control: {
						type: 'text',
						key: 'dailyNotesFormat',
						placeholder: 'DD-MM-YYYY',
					},
				},
				{
					name: 'Weekly Date Range Mode',
					desc: DESC.weeklyDateRangeType,
					control: {
						type: 'dropdown',
						key: 'weeklyDateRangeType',
						options: OPTIONS.weeklyDateRangeType,
					},
				},
				{
					name: 'Monthly Date Range Mode',
					desc: DESC.monthlyDateRangeType,
					control: {
						type: 'dropdown',
						key: 'monthlyDateRangeType',
						options: OPTIONS.monthlyDateRangeType,
					},
				},
			],
		},
		{
			type: 'group',
			heading: 'Weekday Templates',
			items: [
				{
					name: 'Enable weekday templates',
					desc: DESC.enableWeekdayTemplates,
					aliases: ['daily note template', 'weekday'],
					control: { type: 'toggle', key: 'enableWeekdayTemplates' },
				},
			],
		},
		{
			type: 'list',
			heading: 'Weekday template rules',
			emptyState: 'No weekday rules yet.',
			onDelete: (index) => {
				settings.weekdayTemplates.splice(index, 1);
				saveAndRebuild();
			},
			addItem: {
				name: 'Add weekday rule',
				action: () => {
					settings.weekdayTemplates.push({
						day: 6,
						templatePath: '',
					});
					saveAndRebuild();
				},
			},
			items: settings.weekdayTemplates.map((rule, index) => ({
				name: `Rule ${index + 1}`,
				searchable: false,
				render: (setting) => {
					setting
						.addDropdown((dropdown) => {
							WEEKDAY_NAMES.forEach((name, i) => {
								dropdown.addOption(i.toString(), name);
							});
							dropdown.setValue(rule.day.toString());
							dropdown.onChange((value) => {
								rule.day = parseInt(value);
								void plugin.saveSettings();
							});
						})
						.addText((text) => {
							text.setPlaceholder('Template note path')
								.setValue(rule.templatePath)
								.onChange((value) => {
									rule.templatePath = value.trim();
									void plugin.saveSettings();
								});
							// Native autocomplete of note paths for this row.
							const listId = `highlights-extractor-template-notes-${index}`;
							const datalist = setting.controlEl.createEl(
								'datalist',
							);
							datalist.id = listId;
							plugin.app.vault
								.getMarkdownFiles()
								.forEach((file) => {
									datalist.createEl('option', {
										value: file.path,
									});
								});
							text.inputEl.setAttribute('list', listId);
						});
				},
			})),
		},
		{
			type: 'group',
			heading: 'Formatting & Filters',
			items: [
				{
					name: 'Extraction Context',
					desc: DESC.extractContext,
					control: {
						type: 'dropdown',
						key: 'extractContext',
						options: OPTIONS.extractContext,
					},
				},
				{
					name: 'Quick Commands Formatting',
					desc: DESC.quickFormatting,
					control: {
						type: 'dropdown',
						key: 'quickFormatting',
						options: OPTIONS.quickFormatting,
					},
				},
				{
					name: 'Output Format',
					desc: DESC.outputFormat,
					control: {
						type: 'dropdown',
						key: 'outputFormat',
						options: OPTIONS.outputFormat,
					},
				},
				{
					name: 'Required Tag Filter',
					desc: DESC.requiredTag,
					aliases: ['tag'],
					control: {
						type: 'text',
						key: 'requiredTag',
						placeholder: '#Daily',
					},
				},
			],
		},
	];
}
