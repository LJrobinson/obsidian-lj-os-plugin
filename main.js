const { Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder, normalizePath } = require("obsidian");

const DEFAULT_SETTINGS = {
  dynoSheetFolder: "LJ OS/stats",
  dailyNoteFolder: "Daily Notes",
  dailySectionHeading: "## LJ OS Daily Dyno Sheet",
};

module.exports = class LjOsPlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "insert-todays-dyno-sheet",
      name: "Insert Today's Dyno Sheet",
      callback: () => this.insertTodaysDynoSheet(),
    });

    this.addCommand({
      id: "open-todays-dyno-sheet-json",
      name: "Open Today's Dyno Sheet JSON",
      callback: () => this.openTodaysDynoSheetJson(),
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

  async openTodaysDynoSheetJson() {
    const dynoSheetPath = this.getTodaysDynoSheetPath();
    const dynoSheetFile = this.app.vault.getAbstractFileByPath(dynoSheetPath);

    if (!(dynoSheetFile instanceof TFile)) {
      new Notice("Today's LJ OS dyno sheet has not been generated yet.");
      return;
    }

    await this.app.workspace.getLeaf(false).openFile(dynoSheetFile);
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
    const sectionMarkdown = renderDynoSheetMarkdown(dynoSheet, this.settings.dailySectionHeading);
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

    new Setting(containerEl)
      .setName("Daily section heading")
      .setDesc("Exact heading line used to insert or replace the LJ OS section.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.dailySectionHeading)
          .setValue(this.plugin.settings.dailySectionHeading)
          .onChange(async (value) => {
            this.plugin.settings.dailySectionHeading = value.trim() || DEFAULT_SETTINGS.dailySectionHeading;
            await this.plugin.saveSettings();
          })
      );
  }
}

function renderDynoSheetMarkdown(dynoSheet, heading) {
  const summary = dynoSheet.summary || {};
  const repos = Array.isArray(dynoSheet.repos) ? dynoSheet.repos : [];
  const dirtyRepos = repos.filter((repo) => Boolean(repo.dirty));
  const reposWithNotes = repos.filter((repo) => hasNotes(repo.notes));
  const lines = [];

  lines.push((heading || DEFAULT_SETTINGS.dailySectionHeading).trim());
  lines.push("");
  lines.push(`generatedAt: ${formatScalar(dynoSheet.generatedAt || "Not provided")}`);
  lines.push("");
  lines.push("> [!summary] LJ OS Daily Summary");
  lines.push(`> - Repos scanned: ${formatNumber(summary.reposScanned)}`);
  lines.push(`> - Repos touched: ${formatNumber(summary.reposTouchedToday)}`);
  lines.push(`> - Commits today: ${formatNumber(summary.commitsToday)}`);
  lines.push(`> - Dirty repos: ${formatNumber(summary.dirtyRepos)}`);
  lines.push(`> - Unpushed commits: ${formatNumber(summary.unpushedCommits)}`);
  lines.push(`> - Behind commits: ${formatNumber(summary.behindCommits)}`);
  lines.push("");
  lines.push("### Repositories");
  lines.push("");
  lines.push("| Repo | Branch | Commits | Dirty | Unpushed | Behind | Latest Commit |");
  lines.push("| --- | --- | ---: | :---: | ---: | ---: | --- |");

  if (repos.length === 0) {
    lines.push("| No repos included |  | 0 | No | 0 | 0 | No commits yet |");
  } else {
    for (const repo of repos) {
      lines.push(
        [
          tableCell(repo.name || "Unnamed repo"),
          tableCell(repo.branch || ""),
          tableCell(formatNumber(repo.commitsToday)),
          tableCell(formatBoolean(repo.dirty)),
          tableCell(formatNumber(repo.unpushedCommits)),
          tableCell(formatNumber(repo.behindUpstream)),
          tableCell(formatLatestCommit(repo.latestCommit)),
        ].join(" | ").replace(/^/, "| ") + " |"
      );
    }
  }

  lines.push("");
  lines.push("### Cleanup Queue");
  lines.push("");

  if (dirtyRepos.length === 0) {
    lines.push("No dirty repos.");
  } else {
    for (const repo of dirtyRepos) {
      const branch = repo.branch ? ` (${repo.branch})` : "";
      lines.push(`- ${formatScalar(repo.name || "Unnamed repo")}${branch}`);
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

  return lines.join("\n").trimEnd();
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

function formatNumber(value) {
  return Number.isFinite(Number(value)) ? String(Number(value)) : "0";
}

function formatBoolean(value) {
  return value ? "Yes" : "No";
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
