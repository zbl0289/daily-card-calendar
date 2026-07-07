# Homepage

An Obsidian plugin that recreates a card-style daily calendar view: each week is shown as a group, empty days show `当天无记录`, and days with notes render one card per document with the same footer date.

## Install locally

1. Copy this folder into `.obsidian/plugins/daily-card-calendar` inside your vault.
2. Enable community plugins in Obsidian.
3. Enable **Homepage**.
4. Run the command **Open Homepage** or click the calendar ribbon icon.

## Note matching

The plugin finds dated notes across the whole vault by:

- matching the file name against the configured date format, default `YYYY-MM-DD`
- reading the frontmatter field named `homepage-date`

New daily notes are created in the plugin's configured folder. If that setting is empty, the plugin uses Obsidian's core Daily notes folder. The folder setting only controls where new notes are created; it does not limit which dated notes appear in the calendar.

New blank Markdown notes are automatically filled with the same Daily notes template, so ordinary new notes and calendar-created notes share the same frontmatter shape.

Pinned notes are shown as always-on cards before the weekly calendar. Add `homepage-pinned: true` to frontmatter, and optionally add `homepage-pin-order` to control their order. Legacy `date`, `pinned`, and `pinOrder` fields are not read by Homepage.

On startup, and when running **Open Homepage** or clicking the ribbon icon, the plugin opens a configurable two-pane layout. Each side can be set to open nothing, Homepage, or a vault document. By default the left side opens Homepage, while the right side opens `0-本质/随机漫步.excalidraw.md`, then both sidebars are collapsed.

The first image in a note is used as the card cover.
