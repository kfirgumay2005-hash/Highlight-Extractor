# Highlight-Extractor

## Installation and Setup:

Install and enable the plugin in Obsidian.

Navigate to Settings > Highlights & Bold Extractor to set your preferences:

Output Location: Choose whether to append summaries to your active note or create a new note.

Daily Notes Folder & Format: Specify your daily notes directory and date format (e.g., YYYY-MM-DD or DD-MM-YYYY) to enable date-range commands.

Weekly & Monthly Date Range Modes: Set "Last Week" and "Last Month" extractions to use either Rolling Days (past 7/30 days) or Calendar Periods (previous calendar week/month) independently.

Extraction Scope & Output Format: Choose default extraction scope (Exact match, Full Sentence, or Full Paragraph) and output list style (Bullet points, Quote blocks, or Date prefixes).

Required Tag Filter: Optionally restrict extraction to notes containing a specific tag (e.g., #Daily).

## Highlights & Bold Extractor: Feature Guide

1. Command Palette Extractions
   Quickly run extraction commands via the Command Palette (Ctrl/Cmd + P):

Date-Based Extractions: Extract highlights or bold text from yesterday, last week, or last month based on your Daily Notes settings.

Active Note / Folder Extractions: Extract highlights or bold text from your currently open note or all notes in the active folder.

2. Custom Extraction Modal
   Access via the ribbon icon or command palette (Extract selected notes to specific note):

Source & Destination: Search/select multiple source files and target a specific note to append extractions to.

Scope & Mode Controls: Adjust extraction scope (Exact, Sentence, Paragraph) and content type (Highlights, Bold, or Both) on the fly.

Text Formatting Options:

Remove formatting: Strips markup for plain text output.

Preserve formatting: Retains original == and \*\* markup.

Swap: Highlight -> Bold, Bold -> Plain: Converts highlights (==text==) into bold (**text**) and strips existing bold markup down to plain text.
