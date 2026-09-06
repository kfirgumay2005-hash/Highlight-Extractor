import {
	App,
	Plugin,
	TFile,
	Notice,
	MarkdownRenderer,
	Modal,
	Component,
	MarkdownRenderChild,
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
		component: Component;
	}> = [];

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new HighlightsExtractorSettingTab(this.app, this));

		this.addRibbonIcon(
			'list-plus',
			'Extract selected notes to specific note',
			() => {
				new CustomExtractionModal(this.app, this).open();
			},
		);

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

		this.addCommand({
			id: 'custom-extract-modal',
			name: 'Extract selected notes to specific note',
			icon: 'list-plus',
			callback: () => new CustomExtractionModal(this.app, this).open(),
		});

		this.addCommand({
			id: 'archive-monthly-notes',
			name: 'Archive notes by month to MM-YYYY folder',
			icon: 'archive',
			callback: () => new ArchiveMonthModal(this.app, this).open(),
		});

		this.registerMarkdownCodeBlockProcessor(
			'highlights-extractor',
			async (source, el, ctx) => {
				const config = this.parseDynamicBlockConfig(source);
				const renderChild = new MarkdownRenderChild(el);
				ctx.addChild(renderChild);
				this.dynamicBlocks.push({
					el,
					sourcePath: ctx.sourcePath,
					config,
					component: renderChild,
				});
				await this.renderDynamicBlock(
					el,
					config,
					ctx.sourcePath,
					renderChild,
				);
			},
		);

		this.registerEvent(
			this.app.metadataCache.on('changed', (file) => {
				this.updateDynamicBlocks(file);
			}),
		);
	}

	onunload(): void {
		this.dynamicBlocks = [];
	}

	async loadSettings() {
		const data = (await this.loadData()) as unknown;
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(data as HighlightsExtractorSettings) || {},
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

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

	async extractFromFile(
		file: TFile,
		mode: 'highlight' | 'bold' | 'both' = 'both',
		contextMode?: 'exact' | 'sentence' | 'paragraph',
	): Promise<string[]> {
		const fileCache = this.app.metadataCache.getFileCache(file);
		if (this.settings.requiredTag && fileCache?.tags) {
			const hasTag = fileCache.tags.some(
				(tag) => tag.tag === this.settings.requiredTag,
			);
			if (!hasTag) return [];
		} else if (this.settings.requiredTag) {
			return [];
		}

		const content = await this.app.vault.read(file);
		const results: string[] = [];
		const regexes = [];

		if (mode === 'highlight' || mode === 'both') {
			regexes.push(/==(.+?)==/g);
		}
		if (mode === 'bold' || mode === 'both') {
			regexes.push(/\*\*(.+?)\*\*/g);
		}

		const activeContext = contextMode || this.settings.extractContext;

		for (const regex of regexes) {
			let match;
			while ((match = regex.exec(content)) !== null) {
				if (activeContext !== 'exact') {
					results.push(
						this.getContextForMatch(
							content,
							match.index,
							match[0],
							activeContext,
						),
					);
				} else if (match[1]) {
					results.push(match[1]);
				}
			}
		}

		return [...new Set(results)];
	}

	formatExtractedItem(file: TFile, text: string): string {
		switch (this.settings.outputFormat) {
			case 'bullet':
				return `- ${text}`;
			case 'quote':
				return `> ${text}`;
			case 'date': {
				const fileDateStr = window
					.moment(file.stat.ctime)
					.format('YYYY-MM-DD');
				return `${fileDateStr}: ${text}`;
			}
			default:
				return `- ${text}`;
		}
	}

	async appendToNote(targetPath: string, content: string) {
		const abstractFile = this.app.vault.getAbstractFileByPath(targetPath);
		let file: TFile;

		if (abstractFile instanceof TFile) {
			file = abstractFile;
			const existingContent = await this.app.vault.read(file);
			await this.app.vault.modify(
				file,
				existingContent + '\n\n' + content,
			);
		} else if (!abstractFile) {
			file = await this.app.vault.create(targetPath, content);
		} else {
			return;
		}

		const leaf = this.app.workspace.getLeaf(true);
		if (leaf) {
			await leaf.openFile(file);
		}
	}

	async writeSummary(
		title: string,
		groupedContent: Record<string, string[]>,
		targetFileName?: string,
	) {
		if (Object.keys(groupedContent).length === 0) {
			new Notice('No extracted items found matching the criteria.');
			return;
		}

		const now = window.moment().format('YYYY-MM-DD');
		const header = this.settings.includeHeader
			? `# ${title}\n*Generated on: ${now}*\n\n`
			: '';

		let content = header;

		for (const [filePath, items] of Object.entries(groupedContent)) {
			const link = `[[${filePath.replace('.md', '')}]]`;
			content += `### From ${link}\n`;
			items.forEach((item) => {
				content += `${item}\n`;
			});
			content += '\n';
		}

		if (this.settings.outputLocation === 'active-note') {
			const activeFile = this.app.workspace.getActiveFile();
			if (activeFile) {
				const existingContent = await this.app.vault.read(activeFile);
				await this.app.vault.modify(
					activeFile,
					existingContent + '\n\n' + content,
				);
				new Notice('Summary appended to active note.');
				return;
			} else {
				new Notice('No active note. Creating new note instead.');
			}
		}

		const folderPath = this.settings.dailyNotesFolder || '/';
		const finalFileName =
			targetFileName ||
			`${title} - ${window.moment().format('YYYY-MM-DD-HHmm')}`;
		let finalPath =
			folderPath === '/'
				? `${finalFileName}.md`
				: `${folderPath}/${finalFileName}.md`;

		// basic deduplication
		let counter = 1;
		while (this.app.vault.getAbstractFileByPath(finalPath)) {
			finalPath =
				folderPath === '/'
					? `${finalFileName} (${counter}).md`
					: `${folderPath}/${finalFileName} (${counter}).md`;
			counter++;
		}

		await this.appendToNote(finalPath, content);
		new Notice(`Summary generated: ${finalPath}`);
	}

	private getTargetDateRange(daysBack: number): {
		startDate: moment.Moment;
		endDate: moment.Moment;
	} {
		const today = window.moment();
		const range = {
			startDate: today.clone().subtract(daysBack, 'days').startOf('day'),
			endDate: today.clone().subtract(1, 'days').endOf('day'),
		};

		if (
			daysBack === 7 &&
			this.settings.weeklyDateRangeType === 'calendar'
		) {
			const lastWeek = window.moment().subtract(1, 'weeks');
			range.startDate = lastWeek.clone().startOf('isoWeek');
			range.endDate = lastWeek.clone().endOf('isoWeek');
		} else if (
			daysBack === 30 &&
			this.settings.monthlyDateRangeType === 'calendar'
		) {
			const lastMonth = window.moment().subtract(1, 'months');
			range.startDate = lastMonth.clone().startOf('month');
			range.endDate = lastMonth.clone().endOf('month');
		}

		return range;
	}

	async generateSummaryByDateRange(
		daysBack: number,
		title: string,
		mode: 'highlight' | 'bold',
	) {
		const targetFolder = this.settings.dailyNotesFolder;
		const format = this.settings.dailyNotesFormat || 'YYYY-MM-DD';

		const { startDate, endDate } = this.getTargetDateRange(daysBack);

		const files = this.app.vault.getMarkdownFiles();
		const groupedContent: Record<string, string[]> = {};

		for (const file of files) {
			if (targetFolder && !file.path.startsWith(targetFolder)) continue;

			const baseName = file.basename;
			const fileDate = window.moment(baseName, format, true);

			if (
				fileDate.isValid() &&
				fileDate.isBetween(startDate, endDate, 'day', '[]')
			) {
				const items = await this.extractFromFile(file, mode);
				if (items.length > 0) {
					groupedContent[file.path] = items.map((t) =>
						this.formatExtractedItem(file, t),
					);
				}
			}
		}

		await this.writeSummary(title, groupedContent);
	}

	async extractFromActiveFile(mode: 'highlight' | 'bold', name: string) {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('No active note found.');
			return;
		}

		const items = await this.extractFromFile(activeFile, mode);
		if (items.length === 0) {
			new Notice(`No ${name} found in active note.`);
			return;
		}

		const groupedContent: Record<string, string[]> = {
			[activeFile.path]: items.map((t) =>
				this.formatExtractedItem(activeFile, t),
			),
		};

		await this.writeSummary(
			`Extraction from ${activeFile.basename}`,
			groupedContent,
		);
	}

	async extractFromActiveFolder(mode: 'highlight' | 'bold', name: string) {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || !activeFile.parent) {
			new Notice('No active file to determine active folder.');
			return;
		}

		const folder = activeFile.parent;
		const files = this.app.vault
			.getMarkdownFiles()
			.filter((f) => f.parent?.path === folder.path);

		const groupedContent: Record<string, string[]> = {};

		for (const file of files) {
			const items = await this.extractFromFile(file, mode);
			if (items.length > 0) {
				groupedContent[file.path] = items.map((t) =>
					this.formatExtractedItem(file, t),
				);
			}
		}

		await this.writeSummary(
			`Extraction from ${folder.name}`,
			groupedContent,
		);
	}

	// --- Dynamic Code Block Feature ---

	parseDynamicBlockConfig(source: string): DynamicBlockConfig {
		const config: DynamicBlockConfig = {
			timeframe: 'all',
			folder: '',
			tag: '',
			mode: 'both',
		};

		const lines = source.split('\n');
		for (const line of lines) {
			const [key, ...valParts] = line.split(':');
			if (key && valParts.length > 0) {
				const val = valParts.join(':').trim();
				const k = key.trim().toLowerCase();
				if (k === 'timeframe') config.timeframe = val;
				if (k === 'folder') config.folder = val;
				if (k === 'tag') config.tag = val;
				if (k === 'mode') {
					const modeVal = val.toLowerCase();
					if (['highlight', 'bold', 'both'].includes(modeVal)) {
						config.mode = modeVal as 'highlight' | 'bold' | 'both';
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
		component: Component,
	) {
		el.empty();
		const container = el.createDiv('highlights-dynamic-container');

		const files = this.app.vault.getMarkdownFiles();
		let targetFiles = files;

		if (config.folder) {
			targetFiles = targetFiles.filter((f) =>
				f.path.startsWith(config.folder!),
			);
		}

		if (config.tag) {
			targetFiles = targetFiles.filter((f) => {
				const cache = this.app.metadataCache.getFileCache(f);
				return (
					cache?.tags?.some(
						(t) =>
							t.tag === config.tag ||
							t.tag.startsWith(`${config.tag}/`),
					) ?? false
				);
			});
		}

		if (config.timeframe && config.timeframe !== 'all') {
			const format = this.settings.dailyNotesFormat || 'YYYY-MM-DD';
			let startDate = window.moment();
			let endDate = window.moment();

			if (config.timeframe === 'today') {
				startDate = startDate.startOf('day');
				endDate = endDate.endOf('day');
			} else if (config.timeframe === 'last-week') {
				const { startDate: s, endDate: e } = this.getTargetDateRange(7);
				startDate = s;
				endDate = e;
			} else if (config.timeframe === 'last-month') {
				const { startDate: s, endDate: e } =
					this.getTargetDateRange(30);
				startDate = s;
				endDate = e;
			}

			targetFiles = targetFiles.filter((f) => {
				const fd = window.moment(f.basename, format, true);
				return (
					fd.isValid() &&
					fd.isBetween(startDate, endDate, 'day', '[]')
				);
			});
		}

		let markdownContent = '';
		for (const file of targetFiles) {
			if (file.path === sourcePath) continue;
			const items = await this.extractFromFile(file, config.mode);
			if (items.length > 0) {
				const link = `[[${file.path.replace('.md', '')}]]`;
				markdownContent += `**From ${link}**\n`;
				items.forEach((item) => {
					markdownContent += `- ${item}\n`;
				});
				markdownContent += '\n';
			}
		}

		if (!markdownContent) {
			markdownContent =
				'_No highlights or bold text found matching the criteria._';
		}

		await MarkdownRenderer.render(
			this.app,
			markdownContent,
			container,
			sourcePath,
			component,
		);
	}

	private updateDynamicBlocks(file: TFile) {
		for (const block of this.dynamicBlocks) {
			if (
				(!block.config.folder ||
					file.path.startsWith(block.config.folder)) &&
				file.path !== block.sourcePath
			) {
				window.requestAnimationFrame(() => {
					void this.renderDynamicBlock(
						block.el,
						block.config,
						block.sourcePath,
						block.component,
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
	mode: 'highlight' | 'bold' | 'both';
}

class CustomExtractionModal extends Modal {
	plugin: HighlightsExtractorPlugin;
	selectedSourcePaths: Set<string> = new Set();
	targetFilePath = '';
	searchQuery = '';

	mode: 'highlight' | 'bold' | 'both' = 'both';
	contextMode: 'exact' | 'sentence' | 'paragraph' = 'exact';
	textFormatting: 'preserve' | 'plain' | 'swap' = 'preserve';

	constructor(app: App, plugin: HighlightsExtractorPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Custom Extraction' });

		const allMarkdownFiles = this.app.vault.getMarkdownFiles();

		contentEl.createEl('h4', { text: 'Target Note (Append to)' });
		const destSelect = contentEl.createEl('select');
		destSelect.setCssStyles({ width: '100%' });

		destSelect.createEl('option', {
			value: '',
			text: '--- Select Target Note ---',
		});
		allMarkdownFiles.forEach((file) => {
			destSelect.createEl('option', {
				value: file.path,
				text: file.path,
			});
		});
		destSelect.onchange = (e) => {
			this.targetFilePath = (e.target as HTMLSelectElement).value;
		};

		contentEl.createEl('h4', {
			text: 'Source Notes (Extract from)',
			cls: 'modal-heading',
		});

		const searchContainer = contentEl.createDiv();
		searchContainer.setCssStyles({
			display: 'flex',
			gap: '8px',
			marginBottom: '8px',
		});

		const searchInput = searchContainer.createEl('input', {
			type: 'text',
			placeholder: 'Search files or folders...',
		});
		searchInput.setCssStyles({ flex: '1' });

		const btnSelectAll = searchContainer.createEl('button', {
			text: 'Select All Visible',
		});

		const sourceListEl = contentEl.createDiv();
		sourceListEl.setCssStyles({
			maxHeight: '180px',
			overflowY: 'auto',
			border: '1px solid var(--background-modifier-border)',
			borderRadius: '4px',
			padding: '6px',
		});

		const renderSourceList = (query: string) => {
			sourceListEl.empty();
			const lowerQuery = query.toLowerCase();
			const filteredFiles = allMarkdownFiles.filter((f) =>
				f.path.toLowerCase().includes(lowerQuery),
			);

			filteredFiles.forEach((file) => {
				const itemRow = sourceListEl.createDiv();
				itemRow.setCssStyles({
					display: 'flex',
					alignItems: 'center',
					gap: '8px',
					padding: '2px 0',
				});

				const checkbox = itemRow.createEl('input', {
					type: 'checkbox',
				});
				checkbox.checked = this.selectedSourcePaths.has(file.path);

				checkbox.onchange = (e) => {
					if ((e.target as HTMLInputElement).checked) {
						this.selectedSourcePaths.add(file.path);
					} else {
						this.selectedSourcePaths.delete(file.path);
					}
				};

				const label = itemRow.createEl('label', { text: file.path });
				label.setCssStyles({ cursor: 'pointer' });
				label.onclick = () => {
					checkbox.checked = !checkbox.checked;
					checkbox.dispatchEvent(new Event('change'));
				};
			});
			return filteredFiles;
		};

		let currentVisibleFiles = renderSourceList('');

		searchInput.oninput = (e) => {
			this.searchQuery = (e.target as HTMLInputElement).value;
			currentVisibleFiles = renderSourceList(this.searchQuery);
		};

		btnSelectAll.onclick = () => {
			currentVisibleFiles.forEach((f) =>
				this.selectedSourcePaths.add(f.path),
			);
			renderSourceList(this.searchQuery);
		};

		const settingsRow = contentEl.createDiv();
		settingsRow.setCssStyles({
			display: 'flex',
			gap: '10px',
			marginTop: '12px',
		});

		const modeCol = settingsRow.createDiv();
		modeCol.setCssStyles({ flex: '1' });
		modeCol.createEl('h5', { text: 'Extract What?' });
		const modeSelect = modeCol.createEl('select');
		modeSelect.setCssStyles({ width: '100%' });
		modeSelect.createEl('option', {
			value: 'both',
			text: 'Highlights & Bold',
		});
		modeSelect.createEl('option', {
			value: 'highlight',
			text: 'Highlights Only (==)',
		});
		modeSelect.createEl('option', {
			value: 'bold',
			text: 'Bold Only (**)',
		});
		modeSelect.onchange = (e) => {
			this.mode = (e.target as HTMLSelectElement).value as
				| 'highlight'
				| 'bold'
				| 'both';
		};

		const contextCol = settingsRow.createDiv();
		contextCol.setCssStyles({ flex: '1' });
		contextCol.createEl('h5', { text: 'Context Scope' });
		const contextSelect = contextCol.createEl('select');
		contextSelect.setCssStyles({ width: '100%' });
		contextSelect.createEl('option', {
			value: 'exact',
			text: 'Exact Text Only',
		});
		contextSelect.createEl('option', {
			value: 'sentence',
			text: 'Full Sentence',
		});
		contextSelect.createEl('option', {
			value: 'paragraph',
			text: 'Full Paragraph',
		});
		contextSelect.value = this.plugin.settings.extractContext;
		this.contextMode = this.plugin.settings.extractContext;
		contextSelect.onchange = (e) => {
			this.contextMode = (e.target as HTMLSelectElement).value as
				| 'exact'
				| 'sentence'
				| 'paragraph';
		};

		const formatCol = settingsRow.createDiv();
		formatCol.setCssStyles({ flex: '1' });
		formatCol.createEl('h5', { text: 'Text Formatting' });
		const formatSelect = formatCol.createEl('select');
		formatSelect.setCssStyles({ width: '100%' });
		formatSelect.createEl('option', {
			value: 'preserve',
			text: 'Preserve Markup',
		});
		formatSelect.createEl('option', {
			value: 'plain',
			text: 'Remove Formatting',
		});
		formatSelect.createEl('option', {
			value: 'swap',
			text: 'Swap: HL->Bold, Bold->Plain',
		});
		formatSelect.onchange = (e) => {
			this.textFormatting = (e.target as HTMLSelectElement).value as
				| 'preserve'
				| 'plain'
				| 'swap';
		};

		const btnRow = contentEl.createDiv();
		btnRow.setCssStyles({
			display: 'flex',
			justifyContent: 'flex-end',
			gap: '8px',
			marginTop: '20px',
		});

		const btnCancel = btnRow.createEl('button', { text: 'Cancel' });
		btnCancel.onclick = () => this.close();

		const btnExtract = btnRow.createEl('button', {
			text: 'Extract & Append',
			cls: 'mod-cta',
		});
		btnExtract.onclick = async () => {
			if (!this.targetFilePath) {
				new Notice('Please select a target note.');
				return;
			}
			if (this.selectedSourcePaths.size === 0) {
				new Notice('Please select at least one source note.');
				return;
			}

			btnExtract.disabled = true;
			btnExtract.textContent = 'Extracting...';

			await this.executeExtraction();

			this.close();
			new Notice(
				`Extracted from ${this.selectedSourcePaths.size} files to ${this.targetFilePath}`,
			);
		};
	}

	async executeExtraction() {
		const sourceFiles = Array.from(this.selectedSourcePaths)
			.map((p) => this.app.vault.getAbstractFileByPath(p))
			.filter((f): f is TFile => f instanceof TFile);

		const groupedContent: Record<string, string[]> = {};

		for (const file of sourceFiles) {
			let items = await this.plugin.extractFromFile(
				file,
				this.mode,
				this.contextMode,
			);

			if (items.length > 0) {
				if (this.textFormatting === 'plain') {
					items = items.map((i) =>
						i.replace(/==/g, '').replace(/\*\*/g, ''),
					);
				} else if (this.textFormatting === 'swap') {
					items = items.map((i) => {
						let temp = i.replace(/\*\*(.*?)\*\*/g, '$1');
						temp = temp.replace(/==(.*?)==/g, '**$1**');
						return temp;
					});
				}
				groupedContent[file.path] = items.map((t) =>
					this.plugin.formatExtractedItem(file, t),
				);
			}
		}

		await this.plugin.writeSummary(
			'Custom Extraction',
			groupedContent,
			this.targetFilePath.replace('.md', ''),
		);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class ArchiveMonthModal extends Modal {
	plugin: HighlightsExtractorPlugin;
	selectedYear: string;
	selectedMonth: string;

	constructor(app: App, plugin: HighlightsExtractorPlugin) {
		super(app);
		this.plugin = plugin;
		this.selectedYear = window.moment().format('YYYY');
		this.selectedMonth = window.moment().format('MM');
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Archive Daily Notes by Month' });
		contentEl.createEl('p', {
			text: 'Moves daily notes from the selected month into a MM-YYYY subfolder inside your daily notes folder.',
		});

		const inputContainer = contentEl.createDiv();
		inputContainer.setCssStyles({
			display: 'flex',
			gap: '10px',
			marginTop: '20px',
		});

		const yearSelect = inputContainer.createEl('select');
		const currentYear = parseInt(window.moment().format('YYYY'));
		for (let i = currentYear - 5; i <= currentYear + 1; i++) {
			const opt = yearSelect.createEl('option', {
				value: i.toString(),
				text: i.toString(),
			});
			if (i === currentYear) opt.selected = true;
		}
		yearSelect.onchange = (e) =>
			(this.selectedYear = (e.target as HTMLSelectElement).value);

		const monthSelect = inputContainer.createEl('select');
		for (let i = 1; i <= 12; i++) {
			const val = i.toString().padStart(2, '0');
			const opt = monthSelect.createEl('option', {
				value: val,
				text: val,
			});
			if (val === this.selectedMonth) opt.selected = true;
		}
		monthSelect.onchange = (e) =>
			(this.selectedMonth = (e.target as HTMLSelectElement).value);

		const btnRow = contentEl.createDiv();
		btnRow.setCssStyles({
			display: 'flex',
			justifyContent: 'flex-end',
			gap: '8px',
			marginTop: '20px',
		});

		const btnCancel = btnRow.createEl('button', { text: 'Cancel' });
		btnCancel.onclick = () => this.close();

		const btnRun = btnRow.createEl('button', {
			text: 'Archive Notes',
			cls: 'mod-cta',
		});
		btnRun.onclick = async () => {
			btnRun.disabled = true;
			btnRun.textContent = 'Archiving...';
			await this.runArchive();
			this.close();
		};
	}

	async runArchive() {
		const folderPath = this.plugin.settings.dailyNotesFolder || '/';
		const format = this.plugin.settings.dailyNotesFormat || 'YYYY-MM-DD';
		const targetFolderName = `${this.selectedMonth}-${this.selectedYear}`;
		const targetFolderPath =
			folderPath === '/'
				? targetFolderName
				: `${folderPath}/${targetFolderName}`;

		const files = this.app.vault.getMarkdownFiles();
		let moveCount = 0;

		for (const file of files) {
			if (folderPath !== '/' && !file.path.startsWith(folderPath + '/')) {
				continue;
			}
			if (file.path.startsWith(targetFolderPath)) {
				continue;
			}

			const fd = window.moment(file.basename, format, true);
			if (
				fd.isValid() &&
				fd.format('MM') === this.selectedMonth &&
				fd.format('YYYY') === this.selectedYear
			) {
				if (!this.app.vault.getAbstractFileByPath(targetFolderPath)) {
					await this.app.vault.createFolder(targetFolderPath);
				}

				const newPath = `${targetFolderPath}/${file.name}`;
				await this.app.vault.rename(file, newPath);
				moveCount++;
			}
		}

		new Notice(`Archived ${moveCount} notes to ${targetFolderPath}`);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
