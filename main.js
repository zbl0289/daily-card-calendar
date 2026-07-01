const {
  ItemView,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  setIcon,
  TFile,
  WorkspaceLeaf,
  moment,
} = require("obsidian");

const VIEW_TYPE = "daily-card-calendar-view";

const DEFAULT_SETTINGS = {
  dailyFolder: "",
  dateFormat: "YYYY-MM-DD",
  applyTemplateToNewNotes: true,
  columns: 5,
};

module.exports = class DailyCardCalendarPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    this.registerView(
      VIEW_TYPE,
      (leaf) => new DailyCardCalendarView(leaf, this)
    );

    this.addRibbonIcon("calendar-days", "Open daily card calendar", () => {
      this.activateView();
    });

    this.addCommand({
      id: "open-daily-card-calendar",
      name: "Open daily card calendar",
      callback: () => this.activateView(),
    });

    this.addSettingTab(new DailyCardCalendarSettingTab(this.app, this));

    this.registerEvent(
      this.app.vault.on("create", (file) => {
        this.applyTemplateToNewBlankNote(file);
      })
    );

    this.app.workspace.onLayoutReady(async () => {
      await this.openAsHomePage();
    });
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }

  async activateView() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    let leaf = leaves[0];

    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }

    this.app.workspace.revealLeaf(leaf);
  }

  async openAsHomePage() {
    await this.activateView();
    this.collapseLeftSidebar();
  }

  collapseLeftSidebar() {
    const leftSplit = this.app.workspace.leftSplit;
    if (leftSplit && !leftSplit.collapsed && typeof leftSplit.collapse === "function") {
      leftSplit.collapse();
    }
  }

  async applyTemplateToNewBlankNote(file) {
    if (!this.settings.applyTemplateToNewNotes) return;
    if (!(file instanceof TFile) || file.extension !== "md") return;

    const templatePath = this.getDailyTemplatePath();
    if (!templatePath || file.path === templatePath) return;

    const templatesFolder = this.getTemplatesFolder();
    if (templatesFolder && file.path.startsWith(templatesFolder + "/")) return;

    window.setTimeout(async () => {
      const latest = this.app.vault.getAbstractFileByPath(file.path);
      if (!(latest instanceof TFile)) return;

      const content = await this.app.vault.cachedRead(latest);
      if (content.trim()) return;

      const day = moment();
      const rendered = await this.renderDailyTemplate(day, latest.basename);
      await this.app.vault.modify(latest, rendered);
    }, 250);
  }

  normalizeFolder(folder) {
    return (folder || "").trim().replace(/^\/+|\/+$/g, "");
  }

  getDailyNotesOptions() {
    const dailyNotes = this.app.internalPlugins && this.app.internalPlugins.getPluginById("daily-notes");
    return dailyNotes && dailyNotes.instance && dailyNotes.instance.options || {};
  }

  getTemplatesOptions() {
    const templates = this.app.internalPlugins && this.app.internalPlugins.getPluginById("templates");
    return templates && templates.instance && templates.instance.options || {};
  }

  getTemplatesFolder() {
    return this.normalizeFolder(this.getTemplatesOptions().folder);
  }

  getDailyFolder() {
    const configured = this.normalizeFolder(this.settings.dailyFolder);
    if (configured) return configured;

    return this.normalizeFolder(this.getDailyNotesOptions().folder);
  }

  getDailyTemplatePath() {
    const template = this.getDailyNotesOptions().template;
    if (!template) return "";

    const normalized = template.trim().replace(/^\/+|\/+$/g, "");
    return normalized.endsWith(".md") ? normalized : `${normalized}.md`;
  }

  async renderDailyTemplate(day, title) {
    const templatePath = this.getDailyTemplatePath();
    const templateFile = templatePath && this.app.vault.getAbstractFileByPath(templatePath);
    let content = "";

    if (templateFile instanceof TFile) {
      content = await this.app.vault.cachedRead(templateFile);
    } else {
      content = [
        "---",
        `date: ${day.format("YYYY-MM-DD")}`,
        "---",
        "",
        `# ${day.format("MMMM D, YYYY")}`,
        "",
      ].join("\n");
    }

    const rendered = this.renderTemplateVariables(content, day, title);
    return this.ensureDateFrontmatter(rendered, day);
  }

  renderTemplateVariables(content, day, title) {
    return content
      .replace(/{{\s*date(?::([^}]+))?\s*}}/g, (_match, format) => {
        return day.format((format || this.settings.dateFormat || "YYYY-MM-DD").trim());
      })
      .replace(/{{\s*time(?::([^}]+))?\s*}}/g, (_match, format) => {
        return moment().format((format || "HH:mm").trim());
      })
      .replace(/{{\s*title\s*}}/g, title);
  }

  ensureDateFrontmatter(content, day) {
    const dateLine = `date: ${day.format("YYYY-MM-DD")}`;

    if (content.startsWith("---\n")) {
      const end = content.indexOf("\n---", 4);
      if (end !== -1) {
        const frontmatter = content.slice(4, end);
        if (/^date\s*:/m.test(frontmatter)) return content;
        return `---\n${dateLine}\n${frontmatter}${content.slice(end)}`;
      }
    }

    return `---\n${dateLine}\n---\n\n${content}`;
  }

  async saveSettings() {
    await this.saveData(this.settings);
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof DailyCardCalendarView) {
        view.render();
      }
    }
  }
};

class DailyCardCalendarView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.currentWeek = moment().startOf("isoWeek");
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return "Daily Card Calendar";
  }

  getIcon() {
    return "calendar-days";
  }

  async onOpen() {
    this.render();
    this.registerEvent(
      this.app.metadataCache.on("changed", () => this.render())
    );
    this.registerEvent(
      this.app.vault.on("create", () => this.render())
    );
    this.registerEvent(
      this.app.vault.on("delete", () => this.render())
    );
  }

  async render() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("dcc-root");

    const toolbar = container.createDiv({ cls: "dcc-toolbar" });
    const weekEnd = this.currentWeek.clone().add(6, "days");
    toolbar.createEl("h2", {
      text: `${this.currentWeek.format("YYYY年 M月D日")} - ${weekEnd.format("M月D日")}`,
    });

    const actions = toolbar.createDiv({ cls: "dcc-toolbar-actions" });
    this.createButton(actions, "chevron-left", "上一周", () => {
      this.currentWeek = this.currentWeek.clone().subtract(1, "week").startOf("isoWeek");
      this.render();
    });
    this.createButton(actions, "calendar", "今天", () => {
      this.currentWeek = moment().startOf("isoWeek");
      this.render();
    });
    this.createButton(actions, "chevron-right", "下一周", () => {
      this.currentWeek = this.currentWeek.clone().add(1, "week").startOf("isoWeek");
      this.render();
    });
    this.createButton(actions, "refresh-cw", "刷新", () => this.render());

    const weekSection = container.createDiv({ cls: "dcc-week-section" });
    weekSection.createEl("h3", {
      cls: "dcc-week-heading",
      text: `第 ${this.currentWeek.isoWeek()} 周`,
    });

    const grid = weekSection.createDiv({ cls: "dcc-grid" });
    grid.style.setProperty("--dcc-columns", String(this.plugin.settings.columns));

    const notesByDate = this.indexDailyNotes();

    for (let index = 0; index < 7; index += 1) {
      const day = this.currentWeek.clone().add(index, "days");
      const key = day.format("YYYY-MM-DD");
      const files = notesByDate.get(key) || [];

      if (files.length === 0) {
        await this.renderCard(grid, day, null);
      } else {
        for (const file of files) {
          await this.renderCard(grid, day, file);
        }
      }
    }
  }

  createButton(parent, icon, title, callback) {
    const button = parent.createEl("button", {
      cls: "dcc-icon-button",
      attr: { "aria-label": title, title },
    });
    setIcon(button, icon);
    button.addEventListener("click", callback);
    return button;
  }

  indexDailyNotes() {
    const map = new Map();

    for (const file of this.app.vault.getMarkdownFiles()) {
      const cache = this.app.metadataCache.getFileCache(file);
      const frontmatterDate = cache && cache.frontmatter && (
        cache.frontmatter.date ||
        cache.frontmatter.created ||
        cache.frontmatter.day
      );
      const date = this.parseDate(frontmatterDate) || this.parseDate(file.basename);

      if (date) {
        const key = date.format("YYYY-MM-DD");
        const files = map.get(key) || [];
        files.push(file);
        map.set(key, files);
      }
    }

    for (const files of map.values()) {
      files.sort((a, b) => a.basename.localeCompare(b.basename, undefined, {
        numeric: true,
        sensitivity: "base",
      }));
    }

    return map;
  }

  normalizeFolder(folder) {
    return this.plugin.normalizeFolder(folder);
  }

  getDailyFolder() {
    return this.plugin.getDailyFolder();
  }

  parseDate(value) {
    if (!value) return null;

    const text = String(value).trim();
    const formats = [
      this.plugin.settings.dateFormat,
      "YYYY-MM-DD",
      "YYYYMMDD",
      "YYYY/MM/DD",
      "YYYY.MM.DD",
      "YYYY年M月D日",
      "YYYY年MM月DD日",
    ];

    for (const format of formats) {
      const parsed = moment(text, format, true);
      if (parsed.isValid()) return parsed;
    }

    const fallback = moment(text);
    if (fallback.isValid()) return fallback;

    const loose = text.match(/(20\d{2})[-/.年]?\s*(\d{1,2})[-/.月]?\s*(\d{1,2})/);
    if (!loose) return null;

    const parsed = moment(`${loose[1]}-${loose[2]}-${loose[3]}`, "YYYY-M-D", true);
    return parsed.isValid() ? parsed : null;
  }

  async renderCard(parent, day, file) {
    const card = parent.createDiv({ cls: "dcc-card" });
    if (day.isSame(moment(), "day")) card.addClass("is-today");

    const body = card.createDiv({ cls: "dcc-card-body" });
    const quickActions = body.createDiv({ cls: "dcc-card-actions" });
    this.createButton(quickActions, "external-link", "打开笔记", async (event) => {
      event.stopPropagation();
      const target = file || await this.createDailyNote(day);
      await this.app.workspace.getLeaf("tab").openFile(target);
    });
    this.createButton(quickActions, "info", "显示信息", (event) => {
      event.stopPropagation();
      new Notice(file ? file.path : "当天无记录");
    });
    this.createButton(quickActions, "more-horizontal", "更多", (event) => {
      event.stopPropagation();
      new Notice(day.format("YYYY-MM-DD"));
    });

    if (file) {
      await this.renderNotePreview(body, file);
      card.addEventListener("click", async () => {
        await this.app.workspace.getLeaf("tab").openFile(file);
      });
    } else {
      body.createDiv({ cls: "dcc-empty", text: "当天无记录" });
      card.addEventListener("click", async () => {
        const created = await this.createDailyNote(day);
        await this.app.workspace.getLeaf("tab").openFile(created);
      });
    }

    const footer = card.createDiv({ cls: "dcc-card-footer" });
    const footerIcon = footer.createSpan({ cls: "dcc-footer-icon" });
    setIcon(footerIcon, "calendar-days");
    footer.createSpan({
      cls: "dcc-date-label",
      text: day.format("MMMM D, YYYY"),
    });
    footer.createSpan({
      cls: "dcc-weekday",
      text: day.format("dddd"),
    });
  }

  async renderNotePreview(parent, file) {
    const content = await this.app.vault.cachedRead(file);
    const image = this.extractFirstImage(content, file);
    const title = this.extractTitle(content) || file.basename;
    const excerpt = this.extractExcerpt(content);

    parent.createEl("h3", { cls: "dcc-note-title", text: title });

    const preview = parent.createDiv({ cls: image ? "dcc-preview has-image" : "dcc-preview" });
    if (image) {
      preview.createEl("img", {
        cls: "dcc-cover",
        attr: { src: image, alt: title },
      });
    }

    if (excerpt) preview.createEl("p", { text: excerpt });
  }

  extractFirstImage(content, file) {
    const wikiImage = content.match(/!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
    if (wikiImage) {
      const linked = this.app.metadataCache.getFirstLinkpathDest(wikiImage[1], file.path);
      if (linked instanceof TFile) return this.app.vault.getResourcePath(linked);
    }

    const markdownImage = content.match(/!\[[^\]]*]\(([^)]+)\)/);
    if (markdownImage) {
      const raw = markdownImage[1].trim();
      if (/^https?:\/\//i.test(raw) || raw.startsWith("app://")) return raw;

      const linked = this.app.metadataCache.getFirstLinkpathDest(decodeURIComponent(raw), file.path);
      if (linked instanceof TFile) return this.app.vault.getResourcePath(linked);
    }

    return "";
  }

  extractTitle(content) {
    const title = content.match(/^#\s+(.+)$/m);
    return title ? title[1].trim() : "";
  }

  extractExcerpt(content) {
    return content
      .replace(/^---[\s\S]*?---\s*/m, "")
      .replace(/!\[\[[^\]]+\]\]/g, "")
      .replace(/!\[[^\]]*]\([^)]+\)/g, "")
      .replace(/^#\s+.+$/gm, "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(" ")
      .slice(0, 120);
  }

  async createDailyNote(day) {
    const folder = this.getDailyFolder();
    const filename = `${day.format(this.plugin.settings.dateFormat)}.md`;
    const path = folder ? `${folder}/${filename}` : filename;
    const existing = this.app.vault.getAbstractFileByPath(path);

    if (existing instanceof TFile) return existing;

    if (folder) await this.ensureFolder(folder);

    const content = await this.plugin.renderDailyTemplate(day, day.format("MMMM D, YYYY"));

    return this.app.vault.create(path, content);
  }

  async ensureFolder(folder) {
    const parts = folder.split("/").filter(Boolean);
    let current = "";

    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }
}

class DailyCardCalendarSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Daily Card Calendar" });

    new Setting(containerEl)
      .setName("Daily notes folder")
      .setDesc("Leave empty to use Obsidian's Daily notes folder.")
      .addText((text) =>
        text
          .setPlaceholder("Journal/Daily")
          .setValue(this.plugin.settings.dailyFolder)
          .onChange(async (value) => {
            this.plugin.settings.dailyFolder = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Daily note date format")
      .setDesc("Used for matching and creating daily note file names.")
      .addText((text) =>
        text
          .setPlaceholder("YYYY-MM-DD")
          .setValue(this.plugin.settings.dateFormat)
          .onChange(async (value) => {
            this.plugin.settings.dateFormat = value.trim() || DEFAULT_SETTINGS.dateFormat;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Apply template to new blank notes")
      .setDesc("When a new empty Markdown note is created, fill it with the same template used by Daily notes.")
      .addToggle((toggle) =>
        toggle
          .setValue(Boolean(this.plugin.settings.applyTemplateToNewNotes))
          .onChange(async (value) => {
            this.plugin.settings.applyTemplateToNewNotes = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Columns")
      .setDesc("Preferred desktop grid columns.")
      .addSlider((slider) =>
        slider
          .setLimits(2, 7, 1)
          .setDynamicTooltip()
          .setValue(Number(this.plugin.settings.columns))
          .onChange(async (value) => {
            this.plugin.settings.columns = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
