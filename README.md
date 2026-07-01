# Daily Card Calendar

An Obsidian plugin that recreates a card-style daily calendar view: each week is shown as a group, empty days show `当天无记录`, and days with notes render one card per document with the same footer date.

## Install locally

1. Copy this folder into `.obsidian/plugins/daily-card-calendar` inside your vault.
2. Enable community plugins in Obsidian.
3. Enable **Daily Card Calendar**.
4. Run the command **Open daily card calendar** or click the calendar ribbon icon.

## Note matching

The plugin finds dated notes across the whole vault by:

- matching the file name against the configured date format, default `YYYY-MM-DD`
- reading frontmatter fields named `date`, `created`, or `day`

New daily notes are created in the plugin's configured folder. If that setting is empty, the plugin uses Obsidian's core Daily notes folder. The folder setting only controls where new notes are created; it does not limit which dated notes appear in the calendar.

New blank Markdown notes are automatically filled with the same Daily notes template, so ordinary new notes and calendar-created notes share the same frontmatter shape.

The first image in a note is used as the card cover.
