const {
  ItemView,
  MarkdownRenderer,
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
  homeLeftType: "homepage",
  homeLeftFolder: "",
  homeLeftFile: "",
  homeRightType: "file",
  homeRightFolder: "0-本质",
  homeRightFile: "随机漫步.excalidraw.md",
  cardMinWidth: 240,
};

module.exports = class DailyCardCalendarPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    this.registerView(
      VIEW_TYPE,
      (leaf) => new DailyCardCalendarView(leaf, this)
    );

    this.addRibbonIcon("calendar-days", "Open Homepage", () => {
      this.openAsHomePage();
    });

    this.addCommand({
      id: "open-daily-card-calendar",
      name: "Open Homepage",
      callback: () => this.openAsHomePage(),
    });

    this.addSettingTab(new DailyCardCalendarSettingTab(this.app, this));

    this.registerEvent(
      this.app.vault.on("create", (file) => {
        this.applyTemplateToNewBlankNote(file);
      })
    );

    this.app.workspace.onLayoutReady(async () => {
      await this.openHomeLayout();
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
    return leaf;
  }

  async openAsHomePage() {
    await this.openHomeLayout();
  }

  async openHomeLayout() {
    const leftLeaf = await this.openHomeTarget("left", null);
    const rightLeaf = await this.openHomeTarget("right", leftLeaf);
    const activeLeaf = leftLeaf || rightLeaf;

    if (activeLeaf) {
      this.app.workspace.revealLeaf(activeLeaf);
      this.collapseSidebars();
    }
  }

  async openHomeTarget(side, sourceLeaf) {
    const target = this.getHomeTarget(side);
    if (target.type === "none") return null;

    if (target.type === "homepage") {
      return this.openHomePageTarget(side, sourceLeaf);
    }


    return this.openFileTarget(this.getHomeFilePath(side), side, sourceLeaf);
  }

  getHomeTarget(side) {
    const prefix = side === "left" ? "homeLeft" : "homeRight";
    return {
      type: this.normalizeHomeTargetType(this.settings[`${prefix}Type`]),
    };
  }

  normalizeHomeTargetType(type) {
    return ["none", "homepage", "file"].includes(type) ? type : "none";
  }

  async openHomePageTarget(side, sourceLeaf) {
    const existingLeaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (existingLeaf && existingLeaf !== sourceLeaf) {
      this.app.workspace.revealLeaf(existingLeaf);
      return existingLeaf;
    }

    const leaf = await this.getHomeLayoutLeaf(side, sourceLeaf);
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
    return leaf;
  }

  async openFileTarget(path, side, sourceLeaf) {
    if (!path) return null;

    const resolved = this.resolveHomeFilePath(path);
    if (!resolved.file) {
      new Notice(`未找到主页${side === "left" ? "左侧" : "右侧"}文件：${path}`);
      return null;
    }

    const existingLeaf = this.findOpenFileLeaf(resolved.path);
    if (existingLeaf && existingLeaf !== sourceLeaf) {
      this.app.workspace.revealLeaf(existingLeaf);
      this.resetHomeRightExcalidrawView(existingLeaf);
      return existingLeaf;
    }

    const leaf = await this.getHomeLayoutLeaf(side, sourceLeaf);
    await leaf.openFile(resolved.file);
    this.resetHomeRightExcalidrawView(leaf);
    return leaf;
  }

  resolveHomeFilePath(path) {
    const normalized = (path || "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    const candidates = [normalized];

    if (normalized.endsWith(".excalidraw") && !normalized.endsWith(".excalidraw.md")) {
      candidates.push(`${normalized}.md`);
    }

    for (const candidate of candidates) {
      const file = this.app.vault.getAbstractFileByPath(candidate);
      if (file instanceof TFile) {
        return { file, path: candidate };
      }
    }

    return { file: null, path: normalized };
  }

  async getHomeLayoutLeaf(side, sourceLeaf) {
    if (side === "right") {
      if (sourceLeaf) this.app.workspace.revealLeaf(sourceLeaf);
      return this.app.workspace.getLeaf("split");
    }

    return this.app.workspace.getLeaf("tab");
  }

  collapseSidebars() {
    const leftSplit = this.app.workspace.leftSplit;
    if (leftSplit && !leftSplit.collapsed && typeof leftSplit.collapse === "function") {
      leftSplit.collapse();
    }

    const rightSplit = this.app.workspace.rightSplit;
    if (rightSplit && !rightSplit.collapsed && typeof rightSplit.collapse === "function") {
      rightSplit.collapse();
    }
  }

  getHomeFilePath(side) {
    const prefix = side === "left" ? "homeLeft" : "homeRight";
    const fileName = (this.settings[`${prefix}File`] || "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (!fileName) return "";
    if (fileName.includes("/")) return fileName;

    const folder = this.normalizeFolder(this.settings[`${prefix}Folder`]);
    return folder ? `${folder}/${fileName}` : fileName;
  }

  getHomeRightFilePath() {
    return this.getHomeFilePath("right");
  }

  async openHomeRightFile(calendarLeaf) {
    return this.openFileTarget(this.getHomeRightFilePath(), "right", calendarLeaf);
  }

  resetHomeRightExcalidrawView(leaf) {
    [0, 100, 300, 800, 1500, 3000, 5000].forEach((delay) => {
      window.setTimeout(() => this.applyExcalidrawHomeViewport(leaf), delay);
    });
  }

  applyExcalidrawHomeViewport(leaf) {
    const view = leaf && leaf.view;
    const api = view && view.excalidrawAPI;
    if (!api || typeof api.updateScene !== "function") return;

    if (typeof view.preventAutozoom === "function") {
      view.preventAutozoom();
    } else if (view.semaphores) {
      view.semaphores.preventAutozoom = true;
      window.setTimeout(() => {
        if (view.semaphores) view.semaphores.preventAutozoom = false;
      }, 1500);
    }

    const elements = this.getExcalidrawContentElements(api);
    this.updateExcalidrawZoom(view, api, 1);

    if (elements.length > 0 && typeof api.scrollToContent === "function") {
      window.setTimeout(() => {
        api.scrollToContent(elements);
        this.updateExcalidrawZoom(view, api, 1);
      }, 50);
    }
  }

  updateExcalidrawZoom(view, api, value) {
    const update = { appState: { zoom: { value } }, captureUpdate: "NEVER" };
    if (typeof view.updateScene === "function") {
      view.updateScene(update);
    } else {
      api.updateScene(update);
    }
  }

  getExcalidrawContentElements(api) {
    if (typeof api.getSceneElements !== "function") return [];

    return api.getSceneElements().filter((element) => {
      return element
        && !element.isDeleted
        && typeof element.x === "number"
        && typeof element.y === "number";
    });
  }

  findOpenFileLeaf(path) {
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    const allLeaves = typeof this.app.workspace.iterateAllLeaves === "function"
      ? this.getAllLeaves()
      : leaves;

    return allLeaves.find((leaf) => {
      const file = leaf.view && leaf.view.file;
      return file && file.path === path;
    });
  }

  getAllLeaves() {
    const leaves = [];
    this.app.workspace.iterateAllLeaves((leaf) => {
      leaves.push(leaf);
    });
    return leaves;
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
        `homepage-date: ${day.format("YYYY-MM-DD")}`,
        "---",
        "",
        `# ${day.format("MMMM D, YYYY")}`,
        "",
      ].join("\n");
    }

    const rendered = this.renderTemplateVariables(content, day, title);
    return this.ensureHomepageDateFrontmatter(rendered, day);
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

  ensureHomepageDateFrontmatter(content, day) {
    const dateLine = `homepage-date: ${day.format("YYYY-MM-DD")}`;

    if (content.startsWith("---\n")) {
      const end = content.indexOf("\n---", 4);
      if (end !== -1) {
        const frontmatter = content.slice(4, end);
        if (/^homepage-date\s*:/m.test(frontmatter)) return content;
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
    return "Homepage";
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

    const indexedNotes = this.indexNotes();
    if (indexedNotes.pinned.length > 0) {
      const pinnedSection = container.createDiv({ cls: "dcc-pinned-section" });
      const pinnedGrid = pinnedSection.createDiv({ cls: "dcc-grid" });
      pinnedGrid.style.setProperty("--dcc-card-min", `${this.plugin.settings.cardMinWidth || DEFAULT_SETTINGS.cardMinWidth}px`);

      for (const item of indexedNotes.pinned) {
        await this.renderCard(pinnedGrid, null, item.file, { pinned: true, pinOrder: item.pinOrder });
      }
    }

    const weekSection = container.createDiv({ cls: "dcc-week-section" });
    weekSection.createEl("h3", {
      cls: "dcc-section-heading",
      text: `第 ${this.currentWeek.isoWeek()} 周`,
    });

    const grid = weekSection.createDiv({ cls: "dcc-grid" });
    grid.style.setProperty("--dcc-card-min", `${this.plugin.settings.cardMinWidth || DEFAULT_SETTINGS.cardMinWidth}px`);

    const notesByDate = indexedNotes.byDate;

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

  indexNotes() {
    const byDate = new Map();
    const pinned = [];

    for (const file of this.app.vault.getMarkdownFiles()) {
      const cache = this.app.metadataCache.getFileCache(file);
      const frontmatter = cache && cache.frontmatter || {};
      const isPinned = this.isTruthy(frontmatter["homepage-pinned"]);
      if (isPinned) {
        pinned.push({
          file,
          pinOrder: this.parsePinOrder(frontmatter["homepage-pin-order"]),
        });
        continue;
      }

      const frontmatterDate = frontmatter["homepage-date"];
      const date = this.parseDate(frontmatterDate) || this.parseDate(file.basename);

      if (date) {
        const key = date.format("YYYY-MM-DD");
        const files = byDate.get(key) || [];
        files.push(file);
        byDate.set(key, files);
      }
    }

    pinned.sort((a, b) => {
      const orderA = a.pinOrder === null ? Number.POSITIVE_INFINITY : a.pinOrder;
      const orderB = b.pinOrder === null ? Number.POSITIVE_INFINITY : b.pinOrder;
      if (orderA !== orderB) return orderA - orderB;
      return a.file.basename.localeCompare(b.file.basename, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });

    for (const files of byDate.values()) {
      files.sort((a, b) => a.basename.localeCompare(b.basename, undefined, {
        numeric: true,
        sensitivity: "base",
      }));
    }

    return { pinned, byDate };
  }

  isTruthy(value) {
    if (value === true) return true;
    if (typeof value === "string") {
      return ["true", "yes", "1"].includes(value.trim().toLowerCase());
    }
    return false;
  }

  parsePinOrder(value) {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
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

  async renderCard(parent, day, file, options = {}) {
    const card = parent.createDiv({ cls: "dcc-card" });
    if (options.pinned) card.addClass("is-pinned");
    if (day && day.isSame(moment(), "day")) card.addClass("is-today");

    const body = card.createDiv({ cls: "dcc-card-body" });

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
    setIcon(footerIcon, options.pinned ? "pin" : "calendar-days");
    footer.createSpan({
      cls: "dcc-date-label",
      text: options.pinned ? "常驻" : day.format("MMMM D, YYYY"),
    });
    footer.createSpan({
      cls: "dcc-weekday",
      text: options.pinned ? (options.pinOrder != null ? `#${options.pinOrder}` : "") : day.format("dddd"),
    });
  }

  async renderNotePreview(parent, file) {
    const content = await this.app.vault.cachedRead(file);
    const isExcalidraw = this.isExcalidrawFile(file);
    const media = isExcalidraw ? { type: "excalidraw", file } : this.extractFirstPreviewMedia(content, file);
    const title = isExcalidraw ? this.getExcalidrawDisplayTitle(file) : file.basename;
    const excerpt = isExcalidraw ? "" : this.extractPreviewText(content, title);

    parent.createEl("h3", { cls: "dcc-note-title", text: title });

    const preview = parent.createDiv({ cls: media ? `dcc-preview has-${media.type}` : "dcc-preview" });
    if (media && media.type === "image") {
      preview.createEl("img", {
        cls: "dcc-cover",
        attr: { src: media.src, alt: title },
      });
    } else if (media && media.type === "embed") {
      const embed = preview.createDiv({ cls: "dcc-embed-preview" });
      await MarkdownRenderer.renderMarkdown(media.markdown, embed, file.path, this);
    } else if (media && media.type === "excalidraw") {
      await this.renderExcalidrawCardPreview(preview, media.file);
    }

    if (excerpt && (!media || media.type !== "excalidraw")) preview.createEl("p", { text: excerpt });
  }

  async renderExcalidrawCardPreview(parent, file) {
    const content = await this.app.vault.cachedRead(file);
    const texts = this.extractExcalidrawTextElements(content);
    const preview = parent.createDiv({ cls: "dcc-excalidraw-preview" });
    const label = texts.length > 0 ? texts.slice(0, 4).join("\n") : file.basename.replace(/\.excalidraw$/, "");
    preview.createDiv({ cls: "dcc-excalidraw-text", text: label });
  }

  extractExcalidrawTextElements(content) {
    const section = content.match(/## Text Elements\s*([\s\S]*?)(?:\n%%|\n## Drawing|$)/);
    if (!section) return [];

    return section[1]
      .split("\n")
      .map((line) => line.replace(/\s+\^[A-Za-z0-9_-]+\s*$/, "").trim())
      .map((line) => this.cleanPreviewLine(line))
      .filter(Boolean)
      .filter((line) => this.isReadablePreviewText(line));
  }

  extractFirstPreviewMedia(content, file) {
    const wikiImage = content.match(/!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
    if (wikiImage) {
      const target = wikiImage[1].trim();
      const linked = this.app.metadataCache.getFirstLinkpathDest(target, file.path);
      if (linked instanceof TFile) {
        if (this.isImageFile(linked)) {
          return { type: "image", src: this.app.vault.getResourcePath(linked) };
        }
        if (this.isExcalidrawFile(linked)) {
          return { type: "excalidraw", file: linked };
        }
        if (this.isMarkdownPreviewFile(linked)) {
          return { type: "embed", markdown: `![[${target}]]` };
        }
      }
    }

    const markdownImage = content.match(/!\[[^\]]*]\(([^)]+)\)/);
    if (markdownImage) {
      const raw = markdownImage[1].trim();
      if (/^https?:\/\//i.test(raw) || raw.startsWith("app://")) {
        return { type: "image", src: raw };
      }

      const linked = this.app.metadataCache.getFirstLinkpathDest(decodeURIComponent(raw), file.path);
      if (linked instanceof TFile) {
        if (this.isImageFile(linked)) {
          return { type: "image", src: this.app.vault.getResourcePath(linked) };
        }
        if (this.isExcalidrawFile(linked)) {
          return { type: "excalidraw", file: linked };
        }
        if (this.isMarkdownPreviewFile(linked)) {
          return { type: "embed", markdown: `![[${linked.path}]]` };
        }
      }
    }

    return null;
  }

  isReadablePreviewText(line) {
    if (!line) return false;
    if (/^(Element Links|Drawing|Excalidraw Data|Text Elements|Embedded Files)$/i.test(line)) return false;
    if (/[!]?\[\[|\]\]/.test(line)) return false;
    if (/!\[[^\]]*]\([^)]+\)/.test(line)) return false;
    if (/\.(excalidraw|excalidrawlib|md|png|jpe?g|gif|webp|svg)\b/i.test(line)) return false;
    if (!/[\p{L}\p{N}]/u.test(line)) return false;
    return true;
  }

  isImageFile(file) {
    return ["avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "webp"].includes(file.extension.toLowerCase());
  }

  isExcalidrawFile(file) {
    return file.extension === "md" && file.basename.endsWith(".excalidraw");
  }

  getExcalidrawDisplayTitle(file) {
    return file.basename.replace(/\.excalidraw$/, "");
  }

  isMarkdownPreviewFile(file) {
    return file.extension === "md";
  }
  extractTitle(content) {
    const title = content.match(/^#\s+(.+)$/m);
    return title ? title[1].trim() : "";
  }

  extractPreviewText(content, title) {
    const normalizedTitle = title.trim();
    return content
      .replace(/^---[\s\S]*?---\s*/m, "")
      .replace(/!\[\[[^\]]+\]\]/g, "")
      .replace(/!\[[^\]]*]\([^)]+\)/g, "")
      .split("\n")
      .map((line) => this.cleanPreviewLine(line))
      .filter(Boolean)
      .filter((line) => line !== normalizedTitle)
      .slice(0, 1)
      .join(" ")
      .slice(0, 120);
  }

  cleanPreviewLine(line) {
    return line
      .trim()
      .replace(/^#{1,6}\s*/, "")
      .replace(/^>+\s*/, "")
      .replace(/^[-*+]\s+/, "")
      .replace(/^\d+[.)]\s+/, "")
      .replace(/^[-*_]{3,}\s*$/, "")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/_([^_]+)_/g, "$1")
      .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, page, alias) => alias || page)
      .trim();
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

    containerEl.createEl("h2", { text: "Homepage" });

    new Setting(containerEl)
      .setName("日记文件夹")
      .setDesc("留空时使用 Obsidian 核心日记插件的文件夹。")
      .addText((text) =>
        text
          .setPlaceholder("日记")
          .setValue(this.plugin.settings.dailyFolder)
          .onChange(async (value) => {
            this.plugin.settings.dailyFolder = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("日记日期格式")
      .setDesc("用于匹配和创建日记文件名。")
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
      .setName("给新建空白笔记套用模板")
      .setDesc("新建空白 Markdown 笔记时，自动填入日记模板内容。")
      .addToggle((toggle) =>
        toggle
          .setValue(Boolean(this.plugin.settings.applyTemplateToNewNotes))
          .onChange(async (value) => {
            this.plugin.settings.applyTemplateToNewNotes = value;
            await this.plugin.saveSettings();
          })
      );

    this.displayHomeTargetSettings(containerEl, "left", "左屏");
    this.displayHomeTargetSettings(containerEl, "right", "右屏");

    new Setting(containerEl)
      .setName("卡片最小宽度")
      .setDesc("卡片会根据当前面板宽度自动换行。")
      .addSlider((slider) =>
        slider
          .setLimits(200, 320, 4)
          .setDynamicTooltip()
          .setValue(Number(this.plugin.settings.cardMinWidth || DEFAULT_SETTINGS.cardMinWidth))
          .onChange(async (value) => {
            this.plugin.settings.cardMinWidth = value;
            await this.plugin.saveSettings();
          })
      );
  }

  displayHomeTargetSettings(containerEl, side, label) {
    const prefix = side === "left" ? "homeLeft" : "homeRight";
    const currentPath = this.plugin.getHomeFilePath(side);

    new Setting(containerEl)
      .setName(`${label}打开内容`)
      .setDesc("设置为不打开、Homepage 或库内文档。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("none", "不打开")
          .addOption("homepage", "Homepage")
          .addOption("file", "文档")
          .setValue(this.plugin.normalizeHomeTargetType(this.plugin.settings[`${prefix}Type`]))
          .onChange(async (value) => {
            this.plugin.settings[`${prefix}Type`] = value;
            if (value !== "file") {
              this.setHomeFilePath(prefix, "");
            }
            await this.plugin.saveSettings();
            this.display();
          })
      );

    new Setting(containerEl)
      .setName(`${label}文档`)
      .setDesc("选择文档时使用。可以直接输入库内路径，也可以从下拉列表选择。")
      .addText((text) =>
        text
          .setPlaceholder("")
          .setValue(currentPath)
          .onChange(async (value) => {
            this.setHomeFilePath(prefix, value);
            await this.plugin.saveSettings();
          })
      )
      .addDropdown((dropdown) => {
        const files = this.getDocumentFiles();
        const hasCurrent = files.some((file) => file.path === currentPath);

        dropdown.addOption("", "选择文档...");
        for (const file of files) {
          dropdown.addOption(file.path, file.path);
        }

        dropdown
          .setValue(hasCurrent ? currentPath : "")
          .onChange(async (value) => {
            if (!value) return;
            this.setHomeFilePath(prefix, value);
            await this.plugin.saveSettings();
            this.display();
          });
      });
  }

  getDocumentFiles() {
    const files = typeof this.app.vault.getFiles === "function"
      ? this.app.vault.getFiles()
      : this.app.vault.getMarkdownFiles();

    return files
      .filter((file) => file instanceof TFile)
      .sort((a, b) => a.path.localeCompare(b.path, undefined, {
        numeric: true,
        sensitivity: "base",
      }));
  }

  setHomeFilePath(prefix, value) {
    this.plugin.settings[`${prefix}Folder`] = "";
    this.plugin.settings[`${prefix}File`] = value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  }
}
