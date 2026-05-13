const { Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder, normalizePath } = require("obsidian");

const DEFAULT_SETTINGS = {
  dynoSheetFolder: "LJ OS/stats",
  dailyNoteFolder: "Daily Notes",
  dailySectionHeading: "## 🏁 Git Your Daily",
  summaryTitle: "🏁 Git Your Daily",
  repoSectionTitle: "🧰 Repo Garage",
  tidySectionTitle: "🧹 Tidy-Up Queue",
  useEmoji: true,
  showSummary: true,
  showRepoTable: true,
  showTidyQueue: true,
  tableFormat: "standard",
};

module.exports = class LjOsPlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "insert-todays-dyno-sheet",
      name: "Insert Today's Dyno Sheet",
      callback: () => this.insertTodaysDynoSheet(),
    });

    this.addSettingTab(new LjOsSettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  getTodayStamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  getTodaysDynoSheetPath() {
    return joinVaultPath(this.settings.dynoSheetFolder, `${this.getTodayStamp()}.json`);
  }

  getTodaysDailyNotePath() {
    return joinVaultPath(this.settings.dailyNoteFolder, `${this.getTodayStamp()}.md`);
  }

  async insertTodaysDynoSheet() {
    const dynoSheetPath = this.getTodaysDynoSheetPath();
    const dynoSheetFile = this.app.vault.getAbstractFileByPath(dynoSheetPath);

    if (!(dynoSheetFile instanceof TFile)) {
      new Notice("Today's LJ OS dyno sheet has not been generated yet.");
      return;
    }

    let dynoSheet;
    try {
      dynoSheet = JSON.parse(await this.app.vault.read(dynoSheetFile));
    } catch (error) {
      console.error("Failed to parse LJ OS dyno sheet JSON", error);
      new Notice("Today's LJ OS dyno sheet could not be parsed.");
      return;
    }

    if (!dynoSheet || typeof dynoSheet !== "object") {
      new Notice("Today's LJ OS dyno sheet is not a valid JSON object.");
      return;
    }

    const dailyNotePath = this.getTodaysDailyNotePath();
    const dailyNoteFolder = getFolderPart(dailyNotePath);

    try {
      await ensureFolder(this.app.vault, dailyNoteFolder);
    } catch (error) {
      console.error("Failed to create LJ OS Daily Note folder", error);
      new Notice("Today's Daily Note folder could not be created.");
      return;
    }

    let dailyNoteFile = this.app.vault.getAbstractFileByPath(dailyNotePath);
    if (!dailyNoteFile) {
      try {
        dailyNoteFile = await this.app.vault.create(dailyNotePath, "");
      } catch (error) {
        console.error("Failed to create LJ OS Daily Note", error);
        new Notice("Today's Daily Note could not be created.");
        return;
      }
    }

    if (!(dailyNoteFile instanceof TFile)) {
      new Notice("Today's Daily Note path is not a markdown file.");
      return;
    }

    const existingContent = await this.app.vault.read(dailyNoteFile);
    const sectionMarkdown = renderDynoSheetMarkdown(dynoSheet, this.settings);
    const updatedContent = upsertSection(existingContent, this.settings.dailySectionHeading, sectionMarkdown);

    await this.app.vault.modify(dailyNoteFile, updatedContent);
    await this.app.workspace.getLeaf(false).openFile(dailyNoteFile);
    new Notice("Inserted today's LJ OS dyno sheet.");
  }
};

class LjOsSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "LJ OS" });
    containerEl.createEl("h3", { text: "Paths" });

    new Setting(containerEl)
      .setName("Dyno sheet folder")
      .setDesc("Vault-relative folder containing LJ OS JSON dyno sheets.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.dynoSheetFolder)
          .setValue(this.plugin.settings.dynoSheetFolder)
          .onChange(async (value) => {
            this.plugin.settings.dynoSheetFolder = sanitizeFolderSetting(value, DEFAULT_SETTINGS.dynoSheetFolder);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Daily note folder")
      .setDesc("Vault-relative folder where Daily Notes are stored.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.dailyNoteFolder)
          .setValue(this.plugin.settings.dailyNoteFolder)
          .onChange(async (value) => {
            this.plugin.settings.dailyNoteFolder = sanitizeFolderSetting(value, DEFAULT_SETTINGS.dailyNoteFolder);
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: "Labels & Headings" });

    new Setting(containerEl)
      .setName("Daily section heading")
      .setDesc(
        "Exact Markdown heading used to find and replace the existing section. Existing users can change \"## LJ OS Daily Dyno Sheet\" to \"## 🏁 Git Your Daily\"."
      )
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.dailySectionHeading)
          .setValue(this.plugin.settings.dailySectionHeading)
          .onChange(async (value) => {
            this.plugin.settings.dailySectionHeading = value.trim() || DEFAULT_SETTINGS.dailySectionHeading;
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("p", {
      text: "This heading is used to find and replace the existing section.",
    });

    new Setting(containerEl)
      .setName("Summary callout title")
      .setDesc("Title shown in the summary callout.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.summaryTitle)
          .setValue(this.plugin.settings.summaryTitle)
          .onChange(async (value) => {
            this.plugin.settings.summaryTitle = sanitizeTextSetting(value, DEFAULT_SETTINGS.summaryTitle);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Repository section title")
      .setDesc("Title shown above the repository table.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.repoSectionTitle)
          .setValue(this.plugin.settings.repoSectionTitle)
          .onChange(async (value) => {
            this.plugin.settings.repoSectionTitle = sanitizeTextSetting(value, DEFAULT_SETTINGS.repoSectionTitle);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Tidy-up section title")
      .setDesc("Title shown above the dirty repo queue.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.tidySectionTitle)
          .setValue(this.plugin.settings.tidySectionTitle)
          .onChange(async (value) => {
            this.plugin.settings.tidySectionTitle = sanitizeTextSetting(value, DEFAULT_SETTINGS.tidySectionTitle);
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("p", {
      text: "Emoji mode affects rendered output only. It does not rewrite saved title fields.",
    });
    containerEl.createEl("h3", { text: "Display" });

    new Setting(containerEl)
      .setName("Use emoji")
      .setDesc("Render built-in labels with emoji. This does not change saved title strings.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.useEmoji !== false).onChange(async (value) => {
          this.plugin.settings.useEmoji = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Show summary")
      .setDesc("Render the summary callout.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showSummary !== false).onChange(async (value) => {
          this.plugin.settings.showSummary = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Show repository table")
      .setDesc("Render the repository table section.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showRepoTable !== false).onChange(async (value) => {
          this.plugin.settings.showRepoTable = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Show tidy-up queue")
      .setDesc("Render the tidy-up queue section.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showTidyQueue !== false).onChange(async (value) => {
          this.plugin.settings.showTidyQueue = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Table format")
      .setDesc("Choose how many columns the repository table includes.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("compact", "Compact")
          .addOption("standard", "Standard")
          .addOption("detailed", "Detailed")
          .setValue(normalizeTableFormat(this.plugin.settings.tableFormat))
          .onChange(async (value) => {
            this.plugin.settings.tableFormat = normalizeTableFormat(value);
            await this.plugin.saveSettings();
          })
      );
  }
}

function renderDynoSheetMarkdown(dynoSheet, settingsOrHeading) {
  const renderSettings = normalizeRenderSettings(settingsOrHeading);
  const useEmoji = renderSettings.useEmoji !== false;
  const summary = dynoSheet.summary || {};
  const repos = Array.isArray(dynoSheet.repos) ? dynoSheet.repos : [];
  const dirtyRepos = repos.filter((repo) => Boolean(repo.dirty));
  const reposWithNotes = repos.filter((repo) => hasNotes(repo.notes));
  const summaryTitle = formatTitle(renderSettings.summaryTitle, DEFAULT_SETTINGS.summaryTitle, useEmoji);
  const repoSectionTitle = formatTitle(renderSettings.repoSectionTitle, DEFAULT_SETTINGS.repoSectionTitle, useEmoji);
  const tidySectionTitle = formatTitle(renderSettings.tidySectionTitle, DEFAULT_SETTINGS.tidySectionTitle, useEmoji);
  const tableFormat = normalizeTableFormat(renderSettings.tableFormat);
  const showSummary = renderSettings.showSummary !== false;
  const showRepoTable = renderSettings.showRepoTable !== false;
  const showTidyQueue = renderSettings.showTidyQueue !== false;
  const lines = [];
  const blocks = [];

  lines.push((renderSettings.dailySectionHeading || DEFAULT_SETTINGS.dailySectionHeading).trim());
  lines.push("");
  lines.push(`Generated: ${formatGeneratedAt(dynoSheet.generatedAt)}`);

  if (showSummary) {
    blocks.push(renderSummaryLines(summary, summaryTitle, useEmoji));
  }

  if (showRepoTable) {
    blocks.push(renderRepoTableLines(repos, reposWithNotes, repoSectionTitle, useEmoji, tableFormat));
  }

  if (showTidyQueue) {
    blocks.push(renderTidyQueueLines(dirtyRepos, tidySectionTitle, useEmoji));
  }

  if (blocks.length === 0) {
    lines.push("");
    lines.push("No LJ OS sections are enabled.");
  } else {
    for (const block of blocks) {
      lines.push("");
      lines.push(...block);
    }
  }

  return lines.join("\n").trimEnd();
}

function renderSummaryLines(summary, summaryTitle, useEmoji) {
  return [
    `> [!summary] ${summaryTitle}`,
    `> ${maybeEmoji("🧭", `Scanned: **${formatNumber(summary.reposScanned)}** repos`, useEmoji)}`,
    `> ${maybeEmoji("🛠️", `Touched: **${formatNumber(summary.reposTouchedToday)}** repos`, useEmoji)}`,
    `> ${maybeEmoji("🏁", `Commits: **${formatNumber(summary.commitsToday)}**`, useEmoji)}`,
    `> ${maybeEmoji("🧼", `Tidy up: **${formatNumber(summary.dirtyRepos)}** repos`, useEmoji)}`,
    `> ${maybeEmoji("🚀", `Unpushed: **${formatNumber(summary.unpushedCommits)}**`, useEmoji)}`,
    `> ${maybeEmoji("📥", `Behind remote: **${formatNumber(summary.behindCommits)}**`, useEmoji)}`,
  ];
}

function renderRepoTableLines(repos, reposWithNotes, repoSectionTitle, useEmoji, tableFormat) {
  const lines = [`### ${repoSectionTitle}`, "", formatRepoTableHeader(useEmoji, tableFormat), formatRepoTableDivider(tableFormat)];

  if (repos.length === 0) {
    lines.push(formatEmptyRepoTableRow(useEmoji, tableFormat));
  } else {
    for (const repo of repos) {
      lines.push(formatRepoTableRow(repo, useEmoji, tableFormat));
    }
  }

  if (reposWithNotes.length > 0) {
    lines.push("");
    lines.push("### Repo Notes");
    lines.push("");

    for (const repo of reposWithNotes) {
      lines.push(`#### ${formatScalar(repo.name || "Unnamed repo")}`);
      for (const note of normalizeNotes(repo.notes)) {
        lines.push(`- ${formatScalar(note)}`);
      }
      lines.push("");
    }
  }

  return lines;
}

function renderTidyQueueLines(dirtyRepos, tidySectionTitle, useEmoji) {
  const lines = [`### ${tidySectionTitle}`, ""];

  if (dirtyRepos.length === 0) {
    lines.push(maybeEmoji("✅", "All scanned repos are clean.", useEmoji));
    return lines;
  }

  for (const repo of dirtyRepos) {
    const branch = repo.branch ? ` \`${formatInlineCode(repo.branch)}\`` : "";
    lines.push(`- ${maybeEmoji("🧹", `${formatScalar(repo.name || "Unnamed repo")}${branch}`, useEmoji)}`);
  }

  return lines;
}

function upsertSection(content, heading, sectionMarkdown) {
  const cleanHeading = (heading || DEFAULT_SETTINGS.dailySectionHeading).trim();
  const cleanSection = sectionMarkdown.trimEnd();
  const ranges = findSectionRanges(content, cleanHeading);

  if (ranges.length === 0) {
    const prefix = content.trim().length > 0 ? `${content.trimEnd()}\n\n` : "";
    return `${prefix}${cleanSection}\n`;
  }

  let result = content;
  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    const range = ranges[index];
    const replacement = index === 0 ? `${cleanSection}\n\n` : "";
    result = result.slice(0, range.start) + replacement + result.slice(range.end);
  }

  return result.replace(/\n{4,}/g, "\n\n\n").trimEnd() + "\n";
}

function findSectionRanges(content, heading) {
  const escapedHeading = escapeRegExp(heading);
  const headingPattern = new RegExp(`^${escapedHeading}\\s*$`, "gm");
  const ranges = [];
  let match;

  while ((match = headingPattern.exec(content)) !== null) {
    const start = match.index;
    const headingEnd = match.index + match[0].length;
    const afterHeading = content.slice(headingEnd);
    const nextHeadingMatch = /\n##\s+/.exec(afterHeading);
    const end = nextHeadingMatch ? headingEnd + nextHeadingMatch.index + 1 : content.length;
    ranges.push({ start, end });
  }

  return ranges;
}

async function ensureFolder(vault, folderPath) {
  const cleanFolderPath = normalizeFolderPath(folderPath);
  if (!cleanFolderPath) {
    return;
  }

  const parts = cleanFolderPath.split("/");
  let currentPath = "";

  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    const existing = vault.getAbstractFileByPath(currentPath);

    if (!existing) {
      await vault.createFolder(currentPath);
      continue;
    }

    if (!(existing instanceof TFolder)) {
      throw new Error(`Cannot create folder because a file exists at ${currentPath}`);
    }
  }
}

function joinVaultPath(...parts) {
  return normalizePath(parts.map((part) => String(part || "").trim()).filter(Boolean).join("/"));
}

function getFolderPart(path) {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function sanitizeFolderSetting(value, fallback) {
  const normalized = normalizeFolderPath(value);
  return normalized || fallback;
}

function normalizeFolderPath(value) {
  return normalizePath(String(value || "").trim().replace(/^\/+|\/+$/g, ""));
}

function normalizeRenderSettings(settingsOrHeading) {
  if (typeof settingsOrHeading === "string") {
    return Object.assign({}, DEFAULT_SETTINGS, { dailySectionHeading: settingsOrHeading });
  }

  return Object.assign({}, DEFAULT_SETTINGS, settingsOrHeading || {});
}

function normalizeTableFormat(value) {
  return ["compact", "standard", "detailed"].includes(value) ? value : DEFAULT_SETTINGS.tableFormat;
}

function sanitizeTextSetting(value, fallback) {
  const text = formatScalar(value);
  return text || fallback;
}

function formatTitle(value, fallback, useEmoji) {
  const title = stripMarkdownHeadingMarkers(value || fallback) || stripMarkdownHeadingMarkers(fallback);
  return useEmoji ? title : stripLeadingEmoji(title);
}

function stripMarkdownHeadingMarkers(value) {
  return formatScalar(value).replace(/^#{1,6}\s+/, "").trim();
}

function maybeEmoji(icon, text, useEmoji) {
  return useEmoji ? `${icon} ${text}` : text;
}

function stripLeadingEmoji(text) {
  let value = formatScalar(text);
  const leadingEmojiPattern = /^(?:[\s\uFE0F\u200D]*(?:🏁|🧭|🛠|🧰|🧹|🧼|🚀|📥|✅|🌿)[\s\uFE0F\u200D]*)+/u;

  while (leadingEmojiPattern.test(value)) {
    value = value.replace(leadingEmojiPattern, "").trimStart();
  }

  return value;
}

function formatNumber(value) {
  return Number.isFinite(Number(value)) ? String(Number(value)) : "0";
}

function formatRepoTableHeader(useEmoji, tableFormat) {
  if (tableFormat === "compact") {
    return useEmoji
      ? "| Repo | 🌿 Branch | 🧼 Status | 🏁 Commits |"
      : "| Repo | Branch | Status | Commits |";
  }

  if (tableFormat === "detailed") {
    return useEmoji
      ? "| Repo | 🌿 Branch | 🏁 Commits | 🧼 Status | 🚀 Unpushed | 📥 Behind | Latest | Path |"
      : "| Repo | Branch | Commits | Status | Unpushed | Behind | Latest | Path |";
  }

  return useEmoji
    ? "| Repo | 🌿 Branch | 🏁 Commits | 🧼 Status | 🚀 Unpushed | 📥 Behind | Latest |"
    : "| Repo | Branch | Commits | Status | Unpushed | Behind | Latest |";
}

function formatRepoTableDivider(tableFormat) {
  if (tableFormat === "compact") {
    return "| --- | --- | :---: | ---: |";
  }

  if (tableFormat === "detailed") {
    return "| --- | --- | ---: | :---: | ---: | ---: | --- | --- |";
  }

  return "| --- | --- | ---: | :---: | ---: | ---: | --- |";
}

function formatEmptyRepoTableRow(useEmoji, tableFormat) {
  const status = formatRepoStatus(false, useEmoji);

  if (tableFormat === "compact") {
    return toMarkdownTableRow(["No repos included", "", status, "0"]);
  }

  if (tableFormat === "detailed") {
    return toMarkdownTableRow(["No repos included", "", "0", status, "0", "0", "No commits yet", ""]);
  }

  return toMarkdownTableRow(["No repos included", "", "0", status, "0", "0", "No commits yet"]);
}

function formatRepoTableRow(repo, useEmoji, tableFormat) {
  const status = formatRepoStatus(repo.dirty, useEmoji);

  if (tableFormat === "compact") {
    return toMarkdownTableRow([
      repo.name || "Unnamed repo",
      repo.branch || "",
      status,
      formatNumber(repo.commitsToday),
    ]);
  }

  if (tableFormat === "detailed") {
    return toMarkdownTableRow([
      repo.name || "Unnamed repo",
      repo.branch || "",
      formatNumber(repo.commitsToday),
      status,
      formatNumber(repo.unpushedCommits),
      formatNumber(repo.behindUpstream),
      formatLatestCommit(repo.latestCommit),
      repo.path || "",
    ]);
  }

  return toMarkdownTableRow([
    repo.name || "Unnamed repo",
    repo.branch || "",
    formatNumber(repo.commitsToday),
    status,
    formatNumber(repo.unpushedCommits),
    formatNumber(repo.behindUpstream),
    formatLatestCommit(repo.latestCommit),
  ]);
}

function toMarkdownTableRow(cells) {
  return `| ${cells.map((cell) => tableCell(cell)).join(" | ")} |`;
}

function formatRepoStatus(value, useEmoji) {
  if (!useEmoji) {
    return value ? "Tidy" : "Clean";
  }

  return value ? "🧹 Tidy" : "✅ Clean";
}

function formatGeneratedAt(value) {
  if (!value) {
    return "Not provided";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return formatScalar(value);
  }

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function formatScalar(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).replace(/\r?\n/g, " ").trim();
}

function tableCell(value) {
  return formatScalar(value).replace(/\|/g, "\\|");
}

function formatInlineCode(value) {
  return formatScalar(value).replace(/`/g, "'");
}

function formatLatestCommit(latestCommit) {
  if (!latestCommit) {
    return "No commits yet";
  }

  if (typeof latestCommit !== "object") {
    return formatScalar(latestCommit);
  }

  const hash = latestCommit.shortHash || latestCommit.abbreviatedHash || latestCommit.hash || latestCommit.sha || latestCommit.id;
  const message = latestCommit.subject || latestCommit.message || latestCommit.title || latestCommit.summary;

  if (hash && message) {
    return `${shortenHash(hash)} - ${message}`;
  }

  if (hash) {
    return shortenHash(hash);
  }

  if (message) {
    return formatScalar(message);
  }

  return formatScalar(JSON.stringify(latestCommit));
}

function shortenHash(value) {
  const text = formatScalar(value);
  return text.length > 12 ? text.slice(0, 12) : text;
}

function hasNotes(notes) {
  return normalizeNotes(notes).length > 0;
}

function normalizeNotes(notes) {
  if (!notes) {
    return [];
  }

  if (Array.isArray(notes)) {
    return notes.map((note) => formatScalar(note)).filter(Boolean);
  }

  if (typeof notes === "object") {
    return Object.entries(notes)
      .map(([key, value]) => `${key}: ${formatScalar(value)}`)
      .filter((note) => note.trim().length > 0);
  }

  return formatScalar(notes)
    .split(/\r?\n/)
    .map((note) => note.trim())
    .filter(Boolean);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
