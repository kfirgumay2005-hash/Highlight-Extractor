import {
	App,
	Plugin,
	TFile,
	TFolder,
	Notice,
	MarkdownRenderer,
	Modal,
} from 'obsidian';
import {
	HighlightsExtractorSettings,
	DEFAULT_SETTINGS,
	HighlightsExtractorSettingTab,
} from './settings';

export default class HighlightsExtractorPlugin extends Plugin {
	settings!: HighlightsExtractorSettings;

	private dynamicBlocks: Array<{
		el: HTMLElement;
		sourcePath: string;
		config: DynamicBlockConfig;
	}> = [];

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new HighlightsExtractorSettingTab(this.app, this));

		// --- Ribbon Icons ---
		this.addRibbonIcon(
			'list-plus',
			'Extract selected notes to specific note',
			() => {
				new CustomExtractionModal(this.app, this).open();
			},
		);

		// --- Commands ---
		const modes: Array<{
			id: string;
			name: string;
			mode: 'highlight' | 'bold';
		}> = [
			{ id: 'highlights', name: 'Highlights (==)', mode: 'highlight' },
			{ id: 'bold', name: 'Bold (**)', mode: 'bold' },
		];

		modes.forEach(({ id, name, mode }) => {
			this.addCommand({
				id: `extract-${id}-last-week`,
				name: `Extract ${name} from last week (Daily Notes)`,
				icon: 'calendar-days',
				callback: () =>
					this.generateSummaryByDateRange(
						7,
						`Weekly Summary - ${name}`,
						mode,
					),
			});

			this.addCommand({
				id: `extract-${id}-last-day`,
				name: `Extract ${name} from yesterday (Daily Notes)`,
				icon: 'calendar-clock',
				callback: () =>
					this.generateSummaryByDateRange(
						1,
						`Daily Summary - ${name}`,
						mode,
					),
			});

			this.addCommand({
				id: `extract-${id}-last-month`,
				name: `Extract ${name} from last month (Daily Notes)`,
				icon: 'calendar-range',
				callback: () =>
					this.generateSummaryByDateRange(
						30,
						`Monthly Summary - ${name}`,
						mode,
					),
			});

			this.addCommand({
				id: `extract-${id}-active-file`,
				name: `Extract ${name} from active note`,
				icon: 'file-text',
				callback: () => this.extractFromActiveFile(mode, name),
			});

			this.addCommand({
				id: `extract-${id}-active-folder`,
				name: `Extract ${name} from active folder`,
				icon: 'folder-open',
				callback: () => this.extractFromActiveFolder(mode, name),
			});
		});

		// Custom extraction command (Modal)
		this.addCommand({
			id: 'custom-extract-modal',
			name: 'Extract selected notes to specific note',
			icon: 'list-plus',
			callback: () => new CustomExtractionModal(this.app, this).open(),
		});

		// Monthly Archive command (Modal)
		this.addCommand({
			id: 'archive-monthly-notes',
			name: 'Archive notes by month to MM-YYYY folder',
			icon: 'archive',
			callback: () => new ArchiveMonthModal(this.app, this).open(),
		});

		// Register dynamic block processor
		this.registerMarkdownCodeBlockProcessor(
			'highlights-extractor',
			async (source, el, ctx) => {
				const config = this.parseDynamicBlockConfig(source);
				this.dynamicBlocks.push({
					el,
					sourcePath: ctx.sourcePath,
					config,
				});
				await this.renderDynamicBlock(el, config, ctx.sourcePath);
			},
		);

		// Listen to metadata changes to update live blocks
		this.registerEvent(
			this.app.metadataCache.on('changed', (file) => {
				this.updateDynamicBlocks(file);
			}),
		);
	}

	async onunload() {
		this.dynamicBlocks = [];
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// Context Extractor Helper: returns the raw string around match
	private getContextForMatch(
		content: string,
		matchIndex: number,
		fullMatchText: string,
		contextMode: 'exact' | 'sentence' | 'paragraph',
	): string {
		if (contextMode === 'exact') {
			return fullMatchText;
		}

		if (contextMode === 'paragraph') {
			const lineStart = content.lastIndexOf('\n', matchIndex);
			const lineEnd = content.indexOf(
				'\n',
				matchIndex + fullMatchText.length,
			);
			const start = lineStart === -1 ? 0 : lineStart + 1;
			const end = lineEnd === -1 ? content.length : lineEnd;
			return content.substring(start, end).trim();
		}

		if (contextMode === 'sentence') {
			const lineStart = content.lastIndexOf('\n', matchIndex);
			const lineEnd = content.indexOf(
				'\n',
				matchIndex + fullMatchText.length,
			);
			const startLimit = lineStart === -1 ? 0 : lineStart + 1;
			const endLimit = lineEnd === -1 ? content.length : lineEnd;

			const paragraph = content.substring(startLimit, endLimit);
			const relativeMatchIndex = matchIndex - startLimit;

			let sentenceStart = 0;
			const prevPunct = Math.max(
				paragraph.lastIndexOf('.', relativeMatchIndex),
				paragraph.lastIndexOf('!', relativeMatchIndex),
				paragraph.lastIndexOf('?', relativeMatchIndex),
			);
			if (prevPunct !== -1 && prevPunct < relativeMatchIndex) {
				sentenceStart = prevPunct + 1;
			}

			let sentenceEnd = paragraph.length;
			const remaining = paragraph.substring(relativeMatchIndex);
			const nextPunctMatch = remaining.match(/[.!?]/);
			if (nextPunctMatch && nextPunctMatch.index !== undefined) {
				sentenceEnd = relativeMatchIndex + nextPunctMatch.index + 1;
			}

			return paragraph.substring(sentenceStart, sentenceEnd).trim();
		}

		return fullMatchText;
	}

	// Core function: extract and handle formatting correctly
	async extractHighlightsFromFile(
		file: TFile,
		mode: 'highlight' | 'bold' | 'both',
		overrideContext?: 'exact' | 'sentence' | 'paragraph',
		formattingMode: 'strip' | 'preserve' | 'swap' = 'strip',
	): Promise<string[]> {
		const content = await this.app.vault.cachedRead(file);
		const highlights: string[] = [];
		const contextMode =
			overrideContext || this.settings.extractContext || 'exact';

		if (this.settings.requiredTag) {
			const cache = this.app.metadataCache.getFileCache(file);
			const cacheTags = cache?.tags?.map((t) => t.tag) || [];
			const cleanTargetTag = this.settings.requiredTag.replace('#', '');
			const hasInlineTag = content.includes(this.settings.requiredTag);

			if (!hasInlineTag && !cacheTags.includes(cleanTargetTag)) {
				return [];
			}
		}

		let regex: RegExp;
		if (mode === 'both') {
			regex = /(?:==)(.+?)(?:==)|(?:\*\*)(.+?)(?:\*\*)/g;
		} else if (mode === 'highlight') {
			regex = /(?:==)(.+?)(?:==)/g;
		} else {
			regex = /(?:\*\*)(.+?)(?:\*\*)/g;
		}

		let match;
		while ((match = regex.exec(content)) !== null) {
			const fullMatchText = match[0];
			const rawExtractedStr = this.getContextForMatch(
				content,
				match.index,
				fullMatchText,
				contextMode,
			);
			highlights.push(rawExtractedStr);
		}

		const cleanedHighlights = highlights
			.map((text) => {
				// Remove block references first
				let processed = text.replace(/\s*\^[a-zA-Z0-9-]+/g, '');

				if (formattingMode === 'strip') {
					processed = processed
						.replace(/==/g, '')
						.replace(/\*\*/g, '');
				} else if (formattingMode === 'swap') {
					// Highlights (==text==) become Bold (**text**)
					// Bolds (**text**) become normal plain text
					processed = processed
						.replace(/==(.*?)==/g, '%%HL%%$1%%HL%%') // temporarily hide highlights
						.replace(/\*\*(.*?)\*\*/g, '$1') // strip bold
						.replace(/%%HL%%(.*?)%%HL%%/g, '**$1**'); // convert hidden highlights to bold
				}

				return processed.trim();
			})
			.filter((text) => text.length > 0);

		return Array.from(new Set(cleanedHighlights)); // Maintains order while removing duplicates
	}

	formatHighlight(text: string, file: TFile): string {
		switch (this.settings.outputFormat) {
			case 'quote':
				return `> ${text}`;
			case 'date':
				let fileDateStr = window
					.moment(file.stat.ctime)
					.format('YYYY-MM-DD');
				if (this.settings.dailyNotesFormat) {
					const parsed = window.moment(
						file.basename,
						this.settings.dailyNotesFormat,
						true,
					);
					if (parsed.isValid())
						fileDateStr = parsed.format('YYYY-MM-DD');
				} else if (file.basename.match(/\d{4}-\d{2}-\d{2}/)) {
					fileDateStr = file.basename;
				}
				return `${fileDateStr}: ${text}`;
			case 'bullet':
			default:
				return `- ${text}`;
		}
	}

	// Sort files chronologically from oldest (top) to newest (bottom)
	sortFilesByDateAscending(files: TFile[]): TFile[] {
		const dateFormat = this.settings.dailyNotesFormat || 'YYYY-MM-DD';
		return files.sort((a, b) => {
			const dateA = window.moment(a.basename, dateFormat, true);
			const dateB = window.moment(b.basename, dateFormat, true);

			if (dateA.isValid() && dateB.isValid()) {
				return dateA.valueOf() - dateB.valueOf();
			}
			if (dateA.isValid()) return -1;
			if (dateB.isValid()) return 1;

			return a.basename.localeCompare(b.basename);
		});
	}

	async compileSummary(
		files: TFile[],
		title: string,
		mode: 'highlight' | 'bold' | 'both',
		forceAppendFormat: boolean = false,
		overrideContext?: 'exact' | 'sentence' | 'paragraph',
		formattingMode: 'strip' | 'preserve' | 'swap' = 'strip',
	): Promise<string | null> {
		const isAppend =
			forceAppendFormat || this.settings.outputLocation === 'active-note';

		let summaryContent = '';
		if (this.settings.includeHeader) {
			summaryContent = isAppend
				? `\n\n## ${title}\n*Generated on: ${window.moment().format('YYYY-MM-DD HH:mm')}*\n\n`
				: `# ${title}\nGenerated on: ${window.moment().format('YYYY-MM-DD HH:mm')}\n\n`;
		}

		let totalExtracted = 0;
		const sortedFiles = this.sortFilesByDateAscending([...files]);

		for (const file of sortedFiles) {
			const extracted = await this.extractHighlightsFromFile(
				file,
				mode,
				overrideContext,
				formattingMode,
			);
			if (extracted.length > 0) {
				summaryContent += `### [[${file.basename}]]\n`;
				for (const text of extracted) {
					summaryContent += `${this.formatHighlight(text, file)}\n`;
					totalExtracted++;
				}
				summaryContent += '\n';
			}
		}

		if (totalExtracted === 0) {
			new Notice('No matching results found for the criteria.');
			return null;
		}

		return summaryContent;
	}

	async outputSummary(title: string, content: string) {
		if (this.settings.outputLocation === 'active-note') {
			const activeFile = this.app.workspace.getActiveFile();
			if (activeFile) {
				await this.app.vault.append(activeFile, content);
				new Notice(
					`Appended summary to bottom of: ${activeFile.basename}`,
				);
				return;
			} else {
				new Notice(
					'No active note open to append to. Creating a new note instead.',
				);
			}
		}

		try {
			const newFile = await this.app.vault.create(`${title}.md`, content);
			await this.app.workspace.getLeaf('tab').openFile(newFile);
			new Notice(`Successfully created summary: ${title}`);
		} catch (error) {
			console.error('Failed to create summary note:', error);
			new Notice(
				'Error creating summary note. Check console for details.',
			);
		}
	}

	async generateSummaryByDateRange(
		daysBack: number,
		titlePrefix: string,
		mode: 'highlight' | 'bold',
	) {
		const files = this.app.vault.getMarkdownFiles();
		const targetFiles: TFile[] = [];
		const dateFormat = this.settings.dailyNotesFormat || 'YYYY-MM-DD';

		let cutoffDate = window
			.moment()
			.subtract(daysBack, 'days')
			.startOf('day');
		let endDate = window.moment().endOf('day');

		if (
			daysBack === 7 &&
			this.settings.weeklyDateRangeType === 'calendar'
		) {
			cutoffDate = window.moment().subtract(1, 'week').startOf('week');
			endDate = window.moment().subtract(1, 'week').endOf('week');
		} else if (
			daysBack === 30 &&
			this.settings.monthlyDateRangeType === 'calendar'
		) {
			cutoffDate = window.moment().subtract(1, 'month').startOf('month');
			endDate = window.moment().subtract(1, 'month').endOf('month');
		} else if (
			daysBack === 1 &&
			this.settings.weeklyDateRangeType === 'calendar'
		) {
			cutoffDate = window.moment().subtract(1, 'day').startOf('day');
			endDate = window.moment().subtract(1, 'day').endOf('day');
		}

		for (const file of files) {
			if (
				this.settings.dailyNotesFolder &&
				!file.path.startsWith(this.settings.dailyNotesFolder)
			) {
				continue;
			}

			const fileDate = window.moment(file.basename, dateFormat, true);
			if (
				fileDate.isValid() &&
				fileDate.isBetween(cutoffDate, endDate, undefined, '[]')
			) {
				targetFiles.push(file);
			}
		}

		const summaryTitle = `${titlePrefix} - ${window.moment().format('YYYYMMDD-HHmmss')}`;
		const content = await this.compileSummary(
			targetFiles,
			summaryTitle,
			mode,
		);

		if (content) {
			await this.outputSummary(summaryTitle, content);
		}
	}

	async extractFromActiveFile(mode: 'highlight' | 'bold', modeName: string) {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('No active file selected.');
			return;
		}
		const title = `Summary of ${activeFile.basename} - ${modeName}`;
		const content = await this.compileSummary([activeFile], title, mode);
		if (content) await this.outputSummary(title, content);
	}

	async extractFromActiveFolder(
		mode: 'highlight' | 'bold',
		modeName: string,
	) {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || !activeFile.parent) {
			new Notice('Could not determine active folder.');
			return;
		}

		const folder = activeFile.parent;
		const files: TFile[] = [];

		for (const child of folder.children) {
			if (child instanceof TFile && child.extension === 'md') {
				files.push(child);
			}
		}

		const title = `Folder Summary - ${folder.name} - ${modeName}`;
		const content = await this.compileSummary(files, title, mode);

		if (content) await this.outputSummary(title, content);
	}

	parseDynamicBlockConfig(source: string): DynamicBlockConfig {
		const config: DynamicBlockConfig = {
			timeframe: 'all',
			folder: '',
			tag: '',
			mode: 'both',
		};
		const lines = source.split('\n');
		for (const line of lines) {
			const [key, ...valueParts] = line.split(':');
			if (key && valueParts.length > 0) {
				const value = valueParts.join(':').trim();
				if (key.trim().toLowerCase() === 'timeframe')
					config.timeframe = value;
				if (key.trim().toLowerCase() === 'folder')
					config.folder = value;
				if (key.trim().toLowerCase() === 'tag') config.tag = value;
				if (key.trim().toLowerCase() === 'mode') {
					const modeVal = value.toLowerCase();
					if (['highlight', 'bold', 'both'].includes(modeVal)) {
						config.mode = modeVal as any;
					}
				}
			}
		}
		return config;
	}

	async renderDynamicBlock(
		el: HTMLElement,
		config: DynamicBlockConfig,
		sourcePath: string,
	) {
		el.empty();

		let targetFiles = this.app.vault.getMarkdownFiles();

		if (config.folder) {
			targetFiles = targetFiles.filter((f) =>
				f.path.startsWith(config.folder!),
			);
		}

		if (config.timeframe && config.timeframe !== 'all') {
			let daysBack = 0;
			if (config.timeframe === 'last-week') daysBack = 7;
			if (config.timeframe === 'last-month') daysBack = 30;
			if (config.timeframe === 'today') daysBack = 1;

			if (daysBack > 0) {
				const cutoffDate = window
					.moment()
					.subtract(daysBack, 'days')
					.startOf('day');
				const today = window.moment().endOf('day');
				const dateFormat =
					this.settings.dailyNotesFormat || 'YYYY-MM-DD';

				targetFiles = targetFiles.filter((file) => {
					const fileDate = window.moment(
						file.basename,
						dateFormat,
						true,
					);
					return (
						fileDate.isValid() &&
						fileDate.isBetween(cutoffDate, today, undefined, '[]')
					);
				});
			}
		}

		targetFiles = this.sortFilesByDateAscending(targetFiles);

		let markdownContent = '';
		let foundAny = false;

		for (const file of targetFiles) {
			if (file.path === sourcePath) continue;

			const originalTagSetting = this.settings.requiredTag;
			if (config.tag) this.settings.requiredTag = config.tag;

			const extracted = await this.extractHighlightsFromFile(
				file,
				config.mode || 'both',
			);
			this.settings.requiredTag = originalTagSetting;

			if (extracted.length > 0) {
				foundAny = true;
				markdownContent += `**[[${file.basename}]]**\n`;
				for (const text of extracted) {
					markdownContent += `${this.formatHighlight(text, file)}\n`;
				}
				markdownContent += '\n';
			}
		}

		if (!foundAny) {
			markdownContent =
				'*No matching results found for the block criteria.*';
		}

		await MarkdownRenderer.renderMarkdown(
			markdownContent,
			el,
			sourcePath,
			this,
		);
	}

	updateDynamicBlocks(changedFile: TFile) {
		for (const block of this.dynamicBlocks) {
			if (changedFile.path !== block.sourcePath) {
				window.requestAnimationFrame(() => {
					this.renderDynamicBlock(
						block.el,
						block.config,
						block.sourcePath,
					);
				});
			}
		}
	}
}

interface DynamicBlockConfig {
	timeframe?: string;
	folder?: string;
	tag?: string;
	mode?: 'highlight' | 'bold' | 'both';
}

// ---------------------------------------------------------
// Custom Extraction Modal Class
// ---------------------------------------------------------
class CustomExtractionModal extends Modal {
	plugin: HighlightsExtractorPlugin;
	selectedSourcePaths: Set<string> = new Set();

	constructor(app: App, plugin: HighlightsExtractorPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Custom Extraction' });

		const allFiles = this.plugin.sortFilesByDateAscending(
			this.app.vault.getMarkdownFiles(),
		);
		const activeFile = this.app.workspace.getActiveFile();

		// Destination Note
		contentEl.createEl('h4', {
			text: 'Destination Note (Appends to bottom)',
		});
		const destSelect = contentEl.createEl('select', { cls: 'dropdown' });
		destSelect.style.width = '100%';
		allFiles.forEach((f) => {
			const option = destSelect.createEl('option', {
				value: f.path,
				text: f.path,
			});
			if (activeFile && f.path === activeFile.path) {
				option.selected = true;
			}
		});

		// Source Notes Header & Search Controls
		contentEl.createEl('h4', { text: 'Source Notes' });

		const searchContainer = contentEl.createDiv();
		searchContainer.style.display = 'flex';
		searchContainer.style.gap = '8px';
		searchContainer.style.marginBottom = '8px';

		const searchInput = searchContainer.createEl('input', {
			type: 'text',
			placeholder: 'Search notes by name/path...',
		});
		searchInput.style.flex = '1';

		const btnSelectAll = searchContainer.createEl('button', {
			text: 'Select All',
		});
		const btnDeselectAll = searchContainer.createEl('button', {
			text: 'Clear',
		});

		const sourceListEl = contentEl.createDiv();
		sourceListEl.style.maxHeight = '180px';
		sourceListEl.style.overflowY = 'auto';
		sourceListEl.style.border =
			'1px solid var(--background-modifier-border)';
		sourceListEl.style.borderRadius = '4px';
		sourceListEl.style.padding = '6px';

		const renderSourceList = (filterText: string = '') => {
			sourceListEl.empty();
			const lowerFilter = filterText.toLowerCase();

			allFiles.forEach((f) => {
				if (
					lowerFilter &&
					!f.path.toLowerCase().includes(lowerFilter)
				) {
					return;
				}

				const itemRow = sourceListEl.createDiv();
				itemRow.style.display = 'flex';
				itemRow.style.alignItems = 'center';
				itemRow.style.gap = '8px';
				itemRow.style.padding = '2px 0';

				const checkbox = itemRow.createEl('input', {
					type: 'checkbox',
				});
				checkbox.checked = this.selectedSourcePaths.has(f.path);
				checkbox.onchange = () => {
					if (checkbox.checked) {
						this.selectedSourcePaths.add(f.path);
					} else {
						this.selectedSourcePaths.delete(f.path);
					}
				};

				const label = itemRow.createEl('span', { text: f.path });
				label.style.cursor = 'pointer';
				label.onclick = () => {
					checkbox.checked = !checkbox.checked;
					checkbox.dispatchEvent(new Event('change'));
				};
			});
		};

		renderSourceList();

		searchInput.oninput = () => renderSourceList(searchInput.value);

		btnSelectAll.onclick = () => {
			const filter = searchInput.value.toLowerCase();
			allFiles.forEach((f) => {
				if (!filter || f.path.toLowerCase().includes(filter)) {
					this.selectedSourcePaths.add(f.path);
				}
			});
			renderSourceList(searchInput.value);
		};

		btnDeselectAll.onclick = () => {
			this.selectedSourcePaths.clear();
			renderSourceList(searchInput.value);
		};

		// Extraction Mode & Context Controls
		const settingsRow = contentEl.createDiv();
		settingsRow.style.display = 'flex';
		settingsRow.style.gap = '10px';
		settingsRow.style.marginTop = '12px';

		const modeCol = settingsRow.createDiv();
		modeCol.style.flex = '1';
		modeCol.createEl('h4', { text: 'Mode' });
		const modeSelect = modeCol.createEl('select', { cls: 'dropdown' });
		modeSelect.style.width = '100%';
		modeSelect.createEl('option', {
			value: 'both',
			text: 'Highlights & Bold',
		});
		modeSelect.createEl('option', {
			value: 'highlight',
			text: 'Only Highlights',
		});
		modeSelect.createEl('option', { value: 'bold', text: 'Only Bold' });

		const contextCol = settingsRow.createDiv();
		contextCol.style.flex = '1';
		contextCol.createEl('h4', { text: 'Scope' });
		const contextSelect = contextCol.createEl('select', {
			cls: 'dropdown',
		});
		contextSelect.style.width = '100%';
		contextSelect.createEl('option', {
			value: 'exact',
			text: 'Exact match',
		});
		contextSelect.createEl('option', {
			value: 'sentence',
			text: 'Sentence',
		});
		contextSelect.createEl('option', {
			value: 'paragraph',
			text: 'Paragraph',
		});
		contextSelect.value = this.plugin.settings.extractContext || 'exact';

		const formatCol = settingsRow.createDiv();
		formatCol.style.flex = '1';
		formatCol.createEl('h4', { text: 'Text Formatting' });
		const formatSelect = formatCol.createEl('select', { cls: 'dropdown' });
		formatSelect.style.width = '100%';
		formatSelect.createEl('option', {
			value: 'strip',
			text: 'Remove formatting',
		});
		formatSelect.createEl('option', {
			value: 'preserve',
			text: 'Preserve formatting (== & **)',
		});
		formatSelect.createEl('option', {
			value: 'swap',
			text: 'Swap: Highlight -> Bold, Bold -> Plain',
		});

		contentEl.createEl('br');

		const btn = contentEl.createEl('button', {
			text: 'Extract & Append',
			cls: 'mod-cta',
		});
		btn.onclick = async () => {
			const destPath = destSelect.value;
			const destFile = this.app.vault.getAbstractFileByPath(destPath);

			const sourceFiles = Array.from(this.selectedSourcePaths)
				.map((p) => this.app.vault.getAbstractFileByPath(p))
				.filter((f) => f instanceof TFile) as TFile[];

			const mode = modeSelect.value as 'highlight' | 'bold' | 'both';
			const scope = contextSelect.value as
				| 'exact'
				| 'sentence'
				| 'paragraph';
			const formatting = formatSelect.value as
				| 'strip'
				| 'preserve'
				| 'swap';

			if (destFile instanceof TFile && sourceFiles.length > 0) {
				const title = `Custom Extraction - ${window.moment().format('YYYY-MM-DD HH:mm')}`;
				const content = await this.plugin.compileSummary(
					sourceFiles,
					title,
					mode,
					true,
					scope,
					formatting,
				);
				if (content) {
					await this.app.vault.append(destFile, content);
					new Notice(`Appended extraction to ${destFile.basename}`);
				}
				this.close();
			} else {
				new Notice(
					'Please select a destination and at least one source file.',
				);
			}
		};
	}

	onClose() {
		this.contentEl.empty();
	}
}

// ---------------------------------------------------------
// Archive by Month Modal Class
// ---------------------------------------------------------
class ArchiveMonthModal extends Modal {
	plugin: HighlightsExtractorPlugin;

	constructor(app: App, plugin: HighlightsExtractorPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Archive Notes by Month' });
		contentEl.createEl('p', {
			text: 'Select a month. Files matching this month will be moved to a MM-YYYY folder.',
		});

		const inputContainer = contentEl.createDiv();
		inputContainer.style.display = 'flex';
		inputContainer.style.gap = '10px';
		inputContainer.style.marginTop = '20px';

		const monthInput = inputContainer.createEl('input', { type: 'month' });
		monthInput.value = window.moment().format('YYYY-MM');

		const btn = inputContainer.createEl('button', {
			text: 'Archive Notes',
			cls: 'mod-cta',
		});

		btn.onclick = async () => {
			if (!monthInput.value) return;

			const targetMoment = window.moment(monthInput.value, 'YYYY-MM');
			const targetMonthStr = targetMoment.format('MM-YYYY');

			const allFiles = this.app.vault.getMarkdownFiles();
			let movedCount = 0;

			const folderPath = this.plugin.settings.dailyNotesFolder
				? `${this.plugin.settings.dailyNotesFolder}/${targetMonthStr}`
				: targetMonthStr;

			const folderExists =
				this.app.vault.getAbstractFileByPath(folderPath);
			if (!folderExists) {
				await this.app.vault.createFolder(folderPath);
			}

			const dateFormat =
				this.plugin.settings.dailyNotesFormat || 'YYYY-MM-DD';

			for (const file of allFiles) {
				if (
					this.plugin.settings.dailyNotesFolder &&
					!file.path.startsWith(this.plugin.settings.dailyNotesFolder)
				) {
					continue;
				}

				const fileDate = window.moment(file.basename, dateFormat, true);
				if (
					fileDate.isValid() &&
					fileDate.format('YYYY-MM') === monthInput.value
				) {
					const newFilePath = `${folderPath}/${file.name}`;
					if (!this.app.vault.getAbstractFileByPath(newFilePath)) {
						await this.app.vault.rename(file, newFilePath);
						movedCount++;
					}
				}
			}

			new Notice(`Archived ${movedCount} notes to ${folderPath}`);
			this.close();
		};
	}

	onClose() {
		this.contentEl.empty();
	}
}
