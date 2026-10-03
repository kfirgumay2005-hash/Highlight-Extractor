# Highlight-Extractor

An Obsidian plugin that extracts highlights (`==text==`), bold text (`**text**`) or full note content from your notes, builds summaries from your daily notes, and can apply a different daily-note template for specific weekdays.

## Features

### Extraction

- **Extract highlights / bold / all text** from:
    - the last day, last week or last month of daily notes
    - the active note
    - all notes in the active folder
- **Copy to clipboard** from the active note.
- **Custom extraction modal** (ribbon icon or command): pick any source notes (with search and "Select all visible"), choose a target note to append to, and choose:
    - what to extract (highlights, bold, both, all text)
    - context scope (exact text, full sentence, full paragraph)
    - formatting (preserve markup, remove formatting, swap highlight to bold)
- **Dynamic code block** that renders extracted items live inside a note (see [Usage](#dynamic-code-block)).

### Daily notes tools

- **Weekday templates**: use a different template for specific weekdays (for example, a special template for Saturdays) when a new daily note is created.
- **Archive by month**: move daily notes of a chosen month into a `MM-YYYY` subfolder.

## Installation

### From the Community Plugins browser

1. Open **Settings → Community plugins**.
2. Turn off Restricted mode if it is on, then select **Browse**.
3. Search for **Highlight-Extractor**, select **Install**, then **Enable**.

### Manual installation

1. Download `main.js` and `manifest.json` (and `styles.css` if present) from the latest release.
2. Create the folder `<your vault>/.obsidian/plugins/highlight-extractor/` and copy the files into it.
3. Reload Obsidian, open **Settings → Community plugins**, and enable **Highlight-Extractor**.

## Usage

### Quick setup

1. Open **Settings → Highlight-Extractor**.
2. Select your **Daily Notes Folder** and set the **Daily Notes Date Format** to match your daily note file names (for example `YYYY-MM-DD` or `DD-MM-YYYY`).
3. Optionally choose the output location, output format, extraction context and a required tag filter.

### Commands

Open the command palette and search for "Extract" or "Copy". For each of **Highlights (==)**, **Bold (\*\*)** and **All Text** the following commands are available:

| Command                                 | What it does                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| Extract … from last week (Daily Notes)  | Summary of the last 7 days, or the previous calendar week, depending on settings   |
| Extract … from yesterday (Daily Notes)  | Summary of yesterday's daily note                                                  |
| Extract … from last month (Daily Notes) | Summary of the last 30 days, or the previous calendar month, depending on settings |
| Extract … from active note              | Summary of the note you are viewing                                                |
| Extract … from active folder            | Summary of all notes in the active note's folder                                   |
| Copy … to clipboard from active note    | Copies the extracted items to the clipboard                                        |

Additional commands:

- **Extract selected notes to specific note**: opens the custom extraction modal (also available from the ribbon icon).
- **Archive notes by month to MM-YYYY folder**: moves the daily notes of the selected month into a `MM-YYYY` subfolder of your daily notes folder.
- **Apply weekday template to active daily note (overwrites content)**: applies the matching weekday template to the current note, replacing its content.

### Custom extraction

1. Run **Extract selected notes to specific note**.
2. Choose the target note that the results will be appended to.
3. Search and tick the source notes (or use **Select All Visible**).
4. Choose what to extract, the context scope and the text formatting.
5. Select **Extract & Append**, or **Copy to Clipboard** to copy instead.

### Dynamic code block

Add a code block with the language `highlights-extractor` to any note to show extracted items live. The block updates automatically when matching notes change.

````markdown
```highlights-extractor
timeframe: last-week
folder: Daily
tag: #Daily
mode: both
```
````

| Key         | Values                                                    | Default     |
| ----------- | --------------------------------------------------------- | ----------- |
| `timeframe` | `all`, `today`, `last-week`, `last-month`                 | `all`       |
| `folder`    | Only notes whose path starts with this folder             | all folders |
| `tag`       | Only notes containing this tag (nested tags are included) | any         |
| `mode`      | `highlight`, `bold`, `both`, `all`                        | `both`      |

The `timeframe` filter relies on the **Daily Notes Date Format** setting to read dates from file names.

### Weekday templates

1. In the plugin settings, turn on **Enable weekday templates**.
2. Select **Add weekday rule**, choose a weekday, and enter the path of the template note (suggestions appear while you type).
3. When a new daily note is created for that weekday, its content is replaced with the weekday template. Other weekdays keep your default daily note template.

Supported variables inside the template note:

- `{{title}}`: the note name
- `{{date}}` or `{{date:FORMAT}}`: the date of the daily note (default `YYYY-MM-DD`)
- `{{time}}` or `{{time:FORMAT}}`: the current time (default `HH:mm`)

Note: the weekday is read from the note's file name, so the **Daily Notes Date Format** setting must match your daily note names.

## Settings overview

| Setting                          | Description                                    |
| -------------------------------- | ---------------------------------------------- |
| Output Location                  | Create a new note or append to the active note |
| Include Summary Header           | Add a title and generation date to summaries   |
| Daily Notes Folder / Date Format | Where daily notes live and how they are named  |
| Weekly / Monthly Date Range Mode | Rolling days or previous calendar week / month |
| Extraction Context               | Exact text, full sentence or full paragraph    |
| Quick Commands Formatting        | Keep or remove `==` and `**` markup            |
| Output Format                    | Bullet points, quote blocks or date prefix     |
| Required Tag Filter              | Only extract from notes with a given tag       |
| Weekday Templates                | Per-weekday daily note templates               |

## Support

If you find a bug or have a feature request, please open an issue on the project's repository.
