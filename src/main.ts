// @ts-nocheck
import { App, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder, activeDocument, normalizePath, requestUrl } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";

const GIT_SHEET_SCHEMA_VERSION = "0.3.0";
const GIT_SHEET_SOURCE = "obsidian-lj-os-plugin";
const MIN_AUTO_SCAN_INTERVAL_MINUTES = 15;
const DEFAULT_MAX_SCAN_DURATION_SECONDS = 30;
const MIN_MAX_SCAN_DURATION_SECONDS = 5;
const RECENT_AUTO_SCAN_SKIP_MS = 60 * 1000;
const VIEW_OPEN_SCAN_DEBOUNCE_MS = 60 * 1000;
const ACTIVITY_WEATHER_CACHE_MS = 30 * 60 * 1000;
const ACTIVITY_WEATHER_FETCH_TIMEOUT_MS = 2500;
const DEFAULT_DISCOVERY_DEPTH = 3;
const DEFAULT_DISCOVERY_MAX_DIRECTORIES = 2000;
const SCAN_TRIGGERS = ["startup", "interval", "view-open", "manual"] as const;
type ScanTrigger = (typeof SCAN_TRIGGERS)[number];
type DashboardSectionId = "activityBar" | "gitScoreboard" | "repositoryActivity" | "cleanupChecklist";
const DEFAULT_SECTION_ORDER: DashboardSectionId[] = ["activityBar", "gitScoreboard", "repositoryActivity", "cleanupChecklist"];
const DASHBOARD_SECTIONS: Array<{ id: DashboardSectionId; label: string }> = [
  { id: "activityBar", label: "Activity Bar" },
  { id: "gitScoreboard", label: "Git Scoreboard" },
  { id: "repositoryActivity", label: "Repository Activity" },
  { id: "cleanupChecklist", label: "Cleanup Checklist" },
];
const DAILY_ACTIVITY_BUCKETS = [
  { startHour: 0, endHour: 3 },
  { startHour: 3, endHour: 6 },
  { startHour: 6, endHour: 9 },
  { startHour: 9, endHour: 12 },
  { startHour: 12, endHour: 15 },
  { startHour: 15, endHour: 18 },
  { startHour: 18, endHour: 24 },
];
const ACTIVITY_BAR_EMPTY_BLOCK = "⬛";
const ACTIVITY_BAR_ACTIVE_BLOCK = "🟩";
const ACTIVITY_BAR_QUIET_EMPTY_BLOCK = "⬛";
const ACTIVITY_BAR_QUIET_ACTIVE_BLOCK = "🟩";
const MOON_PHASE_EMOJIS = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];
const LUNAR_CYCLE_DAYS = 29.530588853;
const KNOWN_NEW_MOON_UTC_MS = Date.UTC(2000, 0, 6, 18, 14);
const DISCOVERY_SKIP_FOLDER_NAMES = new Set([
  "node_modules",
  ".git",
  "appdata",
  "windows",
  "program files",
  "program files (x86)",
  "$recycle.bin",
  "system volume information",
]);

type UnknownRecord = Record<string, unknown>;
type AsyncAction = () => void | PromiseLike<unknown>;

interface ScanState {
  isScanRunning: boolean;
  lastScanStartedAt: string;
  lastScanCompletedAt: string;
  lastSuccessfulScanCompletedAt: string;
  lastScanDurationMs: number;
  lastScanTrigger: string;
  lastRepoCount: number;
  lastScannedRepoCount: number;
  lastSkippedRepoCount: number;
  lastFailedRepoCount: number;
  lastScanTimedOut: boolean;
  lastScanStatus: string;
}

interface ActivityWeatherContext {
  emoji: string;
  label: string;
  source?: string;
  fetchedAt?: string;
}

interface ActivityWeatherRequest {
  latitude: number;
  longitude: number;
  key: string;
}

interface ActivityWeatherCache {
  key: string;
  fetchedAtMs: number;
  context: ActivityWeatherContext | null;
}

interface LjOsSettings extends UnknownRecord {
  dynoSheetFolder: string;
  dynaSheetFolder?: string;
  gitSheetFolder?: string;
  dailyNoteFolder: string;
  repoPaths: string[];
  scanRoots: string[];
  trackedRepoPaths: string[];
  scanOnStartup: boolean;
  autoScanEnabled: boolean;
  autoScanIntervalMinutes: number;
  scanOnViewOpen: boolean;
  maxScanDurationSeconds: number;
  dailySectionHeading: string;
  summaryTitle: string;
  repoSectionTitle: string;
  tidySectionTitle: string;
  useEmoji: boolean;
  showSummary: boolean;
  summaryStyle: string;
  showRepoTable: boolean;
  repoView: string;
  showTidyQueue: boolean;
  tidyView: string;
  tableFormat: string;
  showDailyActivityBar: boolean;
  showActivityWeatherIcon: boolean;
  activityWeatherLatitude: string;
  activityWeatherLongitude: string;
  showActivityMoonIcon: boolean;
  showThreeDayActivity: boolean;
  showSevenDayActivity: boolean;
  sectionOrder: string[];
  showAdvancedSettings: boolean;
  showAdvancedScanningSettings: boolean;
  scanState?: ScanState;
}

interface ScanOptions {
  trigger?: ScanTrigger;
  showNotice?: boolean;
  maxDurationSeconds?: number;
  context?: ScanBudgetContext;
}

interface ScanBudgetContext {
  scanStartedAtMs: number;
  deadlineMs: number;
  currentRepoDeadlineMs: number | null;
  timedOut: boolean;
  warnings: string[];
}

interface DiscoveryOptions {
  maxDepth?: number;
  maxDurationSeconds?: number;
  configDir?: string;
}

interface DiscoveryResult {
  repositories: string[];
  warnings: string[];
}

interface ConfiguredPaths {
  scanRoots: string[];
  trackedRepoPaths: string[];
}

interface GitSheetMetadata {
  scanCompletedAt: string;
  durationMs: number;
  repoCount: number;
  scannedRepoCount: number;
  skippedRepoCount: number;
  failedRepoCount: number;
  timedOut: boolean;
  scanTrigger: string;
  warnings: unknown[];
}

interface PathTextareaOptions {
  label: string;
  description: string;
  placeholder: string;
  rows: number;
  value: string;
  onChange: (value: string) => Promise<unknown>;
}

const DEFAULT_SETTINGS: LjOsSettings = {
  dynoSheetFolder: "LJ OS/stats",
  dailyNoteFolder: "Daily Notes",
  repoPaths: [],
  scanRoots: [],
  trackedRepoPaths: [],
  scanOnStartup: true,
  autoScanEnabled: true,
  autoScanIntervalMinutes: 60,
  scanOnViewOpen: true,
  maxScanDurationSeconds: DEFAULT_MAX_SCAN_DURATION_SECONDS,
  dailySectionHeading: "## 🧱 Git Wall",
  summaryTitle: "🏁 Git Wall",
  repoSectionTitle: "🧰 Repo Garage",
  tidySectionTitle: "🧹 Tidy-Up Queue",
  useEmoji: true,
  showSummary: true,
  summaryStyle: "callout",
  showRepoTable: true,
  repoView: "table",
  showTidyQueue: true,
  tidyView: "queue",
  tableFormat: "standard",
  showDailyActivityBar: true,
  showActivityWeatherIcon: false,
  activityWeatherLatitude: "",
  activityWeatherLongitude: "",
  showActivityMoonIcon: false,
  showThreeDayActivity: false,
  showSevenDayActivity: false,
  sectionOrder: DEFAULT_SECTION_ORDER,
  showAdvancedSettings: false,
  showAdvancedScanningSettings: false,
};

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function coerceSettings(savedSettings: UnknownRecord): LjOsSettings {
  const settings = Object.assign({}, DEFAULT_SETTINGS, savedSettings) as LjOsSettings;

  settings.dynoSheetFolder = formatScalar(settings.dynoSheetFolder);
  settings.dailyNoteFolder = formatScalar(settings.dailyNoteFolder);

  if (hasOwn(savedSettings, "gitSheetFolder") && !hasOwn(savedSettings, "dynoSheetFolder")) {
    settings.dynoSheetFolder = formatScalar(savedSettings.gitSheetFolder);
  }

  const migratedPaths = migrateConfiguredPaths(savedSettings);
  settings.scanRoots = migratedPaths.scanRoots;
  settings.trackedRepoPaths = migratedPaths.trackedRepoPaths;
  settings.repoPaths = [];
  settings.autoScanIntervalMinutes = normalizeAutoScanIntervalMinutes(settings.autoScanIntervalMinutes);
  settings.maxScanDurationSeconds = normalizeMaxScanDurationSeconds(
    hasOwn(savedSettings, "maxScanDurationSeconds") ? savedSettings.maxScanDurationSeconds : DEFAULT_MAX_SCAN_DURATION_SECONDS
  );
  settings.scanOnStartup = savedSettings.scanOnStartup !== false;
  settings.autoScanEnabled = savedSettings.autoScanEnabled !== false;
  settings.scanOnViewOpen = savedSettings.scanOnViewOpen !== false;
  settings.showAdvancedScanningSettings = savedSettings.showAdvancedScanningSettings === true;
  settings.activityWeatherLatitude = sanitizeCoordinateSetting(settings.activityWeatherLatitude);
  settings.activityWeatherLongitude = sanitizeCoordinateSetting(settings.activityWeatherLongitude);
  settings.sectionOrder = normalizeSectionOrder(settings.sectionOrder);

  return settings;
}

function runAsync(action: () => PromiseLike<unknown>): void {
  void Promise.resolve(action()).catch((error: unknown) => console.error("LJ OS async action failed", error));
}

export default class LjOsPlugin extends Plugin {
  settings: LjOsSettings;
  scanState: ScanState;
  settingTab: LjOsSettingTab | null;
  autoScanIntervalId: number | null;
  activityWeatherCache: ActivityWeatherCache | null;
  startupScanTimeoutId: number | null;
  lastViewOpenScanRequestedAt: number;
  suppressViewOpenScanUntil: number;

  async onload() {
    this.autoScanIntervalId = null;
    this.activityWeatherCache = null;
    this.startupScanTimeoutId = null;
    this.lastViewOpenScanRequestedAt = 0;
    this.suppressViewOpenScanUntil = 0;

    await this.loadSettings();

    this.addCommand({
      id: "insert-todays-git-sheet",
      name: "Insert Today's Git Wall",
      callback: () => {
        runAsync(() => this.insertTodaysGitSheet());
      },
    });

    this.addCommand({
      id: "scan-configured-git-repositories",
      name: "Scan Configured Git Repositories",
      callback: () => {
        runAsync(() => this.scanTodaysGitSheet({ showNotice: true }));
      },
    });

    this.addCommand({
      id: "discover-git-repositories",
      name: "Discover Repositories",
      callback: () => {
        runAsync(() => this.discoverRepositories({ showNotice: true }));
      },
    });

    this.settingTab = new LjOsSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);
    this.registerViewOpenScanHandler();
    this.setupAutoScanTimer();
    this.scheduleStartupScan();
  }

  async loadSettings() {
    const savedSettings = toRecord(await this.loadData());
    this.settings = coerceSettings(savedSettings);
    this.scanState = normalizeScanState(savedSettings.scanState);
    if (this.scanState.isScanRunning) {
      this.scanState.lastScanStatus = "interrupted: previous scan did not finish";
    }
    this.scanState.isScanRunning = false;
    this.settings.scanState = this.scanState;
  }

  async saveSettings() {
    this.settings.scanState = this.scanState;
    await this.saveData(this.settings);
  }

  getTodayStamp() {
    return formatLocalDateStamp(new Date());
  }

  getGitSheetPathForDate(dateStamp: unknown): string {
    return joinVaultPath(this.settings.dynoSheetFolder, `${formatScalar(dateStamp)}.json`);
  }

  getTodaysGitSheetPath() {
    return this.getGitSheetPathForDate(this.getTodayStamp());
  }

  getTodaysDailyNotePath() {
    return joinVaultPath(this.settings.dailyNoteFolder, `${this.getTodayStamp()}.md`);
  }

  async scanTodaysGitSheet(options: ScanOptions = {}) {
    const trigger = normalizeScanTrigger(options.trigger || "manual");
    const isAutomatic = trigger !== "manual";
    const repoPaths = normalizeRepoPaths(this.settings.trackedRepoPaths);
    const scanRoots = normalizeRepoPaths(this.settings.scanRoots);

    if (this.scanState.isScanRunning) {
      const message = "LJ OS scan already running. Skipped starting another scan.";
      this.updateScanState({ lastScanStatus: "skipped: scan already running" });

      if (options.showNotice) {
        new Notice(message);
      }

      return null;
    }

    if (isAutomatic && this.wasScanCompletedRecently(RECENT_AUTO_SCAN_SKIP_MS)) {
      this.updateScanState({ lastScanStatus: "skipped: recent scan" });
      return null;
    }

    if (repoPaths.length === 0) {
      this.updateScanState({ lastScanStatus: "skipped: no tracked repositories" });

      if (options.showNotice) {
        new Notice(
          scanRoots.length > 0
            ? "No tracked repos found yet. Run Discover repositories first."
            : "Add a scan root or tracked Git repository in LJ OS settings."
        );
      }

      return null;
    }

    const startedAt = new Date().toISOString();
    const startedAtMs = Date.now();
    this.updateScanState({
      isScanRunning: true,
      lastScanStartedAt: startedAt,
      lastScanTrigger: trigger,
      lastScanStatus: `running: ${trigger}`,
    });

    try {
      const gitSheet = await scanConfiguredRepositories(repoPaths, this.getTodayStamp(), {
        trigger,
        maxDurationSeconds: this.settings.maxScanDurationSeconds,
      });

      await this.addActivityWeatherToGitSheet(gitSheet);
      await this.writeGitSheet(gitSheet);
      this.completeScanState(gitSheet, startedAtMs);

      if (options.showNotice) {
        new Notice(formatManualScanNotice(gitSheet, this.getTodaysGitSheetPath()));
      }

      return gitSheet;
    } catch (error) {
      console.error("Failed to save LJ OS Git Wall JSON", error);
      const completedAt = new Date().toISOString();
      this.updateScanState({
        isScanRunning: false,
        lastScanCompletedAt: completedAt,
        lastScanDurationMs: Date.now() - startedAtMs,
        lastScanTrigger: trigger,
        lastScanStatus: `failed: ${formatGitError(error)}`,
      });

      if (options.showNotice) {
        new Notice("Today's LJ OS Git Wall data could not be saved.");
      }

      return null;
    } finally {
      if (this.scanState.isScanRunning && this.scanState.lastScanStartedAt === startedAt) {
        this.updateScanState({ isScanRunning: false });
      }
    }
  }

  async writeGitSheet(gitSheet) {
    const gitSheetPath = this.getTodaysGitSheetPath();
    const gitSheetFolder = getFolderPart(gitSheetPath);

    await ensureFolder(this.app.vault, gitSheetFolder);

    const gitSheetFile = this.app.vault.getAbstractFileByPath(gitSheetPath);
    const content = `${JSON.stringify(gitSheet, null, 2)}\n`;

    if (!gitSheetFile) {
      await this.app.vault.create(gitSheetPath, content);
      return;
    }

    if (!(gitSheetFile instanceof TFile)) {
      throw new Error(`Cannot save Git Wall data because ${gitSheetPath} is not a file.`);
    }

    await this.app.vault.modify(gitSheetFile, content);
  }

  async insertTodaysGitSheet() {
    const gitSheet = await this.readTodaysGitSheet();
    const recentActivityDayCount = getRecentActivityDayCount(this.settings);
    const recentGitSheets =
      gitSheet && recentActivityDayCount > 0
        ? await this.readRecentGitSheets(recentActivityDayCount)
        : [];

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
    const activityWeatherIcon = gitSheet ? await this.resolveActivityWeatherIcon() : null;
    const renderSettings = Object.assign({}, this.settings, { recentGitSheets, activityWeatherIcon });
    const sectionMarkdown = gitSheet
      ? renderGitSheetMarkdown(gitSheet, renderSettings)
      : renderMissingGitSheetMarkdown(this.settings);
    const updatedContent = upsertSection(existingContent, this.settings.dailySectionHeading, sectionMarkdown);

    await this.app.vault.modify(dailyNoteFile, updatedContent);
    this.suppressViewOpenScanUntil = Date.now() + 2000;
    await this.app.workspace.getLeaf(false).openFile(dailyNoteFile);
    new Notice(gitSheet ? "Inserted cached LJ OS Git Wall data." : "Inserted LJ OS Git Wall fallback. No scan data found for today.");
  }

  async readTodaysGitSheet() {
    return this.readGitSheetForDate(this.getTodayStamp());
  }

  async readGitSheetForDate(dateStamp: unknown): Promise<UnknownRecord | null> {
    const gitSheetPath = this.getGitSheetPathForDate(dateStamp);
    const gitSheetFile = this.app.vault.getAbstractFileByPath(gitSheetPath);

    if (!(gitSheetFile instanceof TFile)) {
      return null;
    }

    try {
      const gitSheet: unknown = JSON.parse(await this.app.vault.read(gitSheetFile));
      return isRecord(gitSheet) ? gitSheet : null;
    } catch (error) {
      console.error("Failed to parse existing LJ OS Git Wall JSON", error);
      return null;
    }
  }

  async readRecentGitSheets(dayCount = 7) {
    const dateInfos = getRecentLocalDateInfos(dayCount);
    const entries = [];

    for (const dateInfo of dateInfos) {
      entries.push(Object.assign({}, dateInfo, { gitSheet: await this.readGitSheetForDate(dateInfo.dateStamp) }));
    }

    return entries;
  }

  async addActivityWeatherToGitSheet(gitSheet: unknown) {
    if (!isRecord(gitSheet)) {
      return;
    }

    try {
      const activityWeather = await this.resolveActivityWeatherContext();
      if (activityWeather) {
        gitSheet.activityWeather = activityWeather;
      }
    } catch {
      return;
    }
  }

  async resolveActivityWeatherIcon() {
    const activityWeather = await this.resolveActivityWeatherContext();
    return activityWeather ? activityWeather.emoji : null;
  }

  async resolveActivityWeatherContext() {
    const request = normalizeActivityWeatherRequest(this.settings);

    if (!request) {
      return null;
    }

    if (
      this.activityWeatherCache &&
      this.activityWeatherCache.key === request.key &&
      Date.now() - this.activityWeatherCache.fetchedAtMs < ACTIVITY_WEATHER_CACHE_MS
    ) {
      return this.activityWeatherCache.context;
    }

    const context = await fetchOpenMeteoActivityWeatherContext(request);
    this.activityWeatherCache = {
      key: request.key,
      fetchedAtMs: Date.now(),
      context,
    };
    return context;
  }

  async discoverRepositories(options: ScanOptions = {}) {
    const scanRoots = normalizeRepoPaths(this.settings.scanRoots);

    if (scanRoots.length === 0) {
      if (options.showNotice) {
        new Notice("Add at least one scan root or exact repo path first.");
      }

      return null;
    }

    const discovery = discoverGitRepositories(scanRoots, {
      maxDepth: DEFAULT_DISCOVERY_DEPTH,
      maxDurationSeconds: this.settings.maxScanDurationSeconds,
      configDir: this.app.vault.configDir,
    });
    const beforeCount = normalizeRepoPaths(this.settings.trackedRepoPaths).length;
    this.settings.trackedRepoPaths = mergeUniquePaths(this.settings.trackedRepoPaths, discovery.repositories);
    const afterCount = this.settings.trackedRepoPaths.length;
    await this.saveSettings();
    this.refreshSettingsDisplay();

    if (options.showNotice) {
      const addedCount = afterCount - beforeCount;
      new Notice(`Discovered ${discovery.repositories.length} repositories from ${scanRoots.length} scan roots. Added ${addedCount} new.`);
    }

    if (discovery.warnings.length > 0) {
      console.warn("LJ OS repository discovery warnings", discovery.warnings);
    }

    return discovery;
  }

  setupAutoScanTimer() {
    this.clearAutoScanTimer();

    if (this.settings.autoScanEnabled === false) {
      return;
    }

    const intervalMs = normalizeAutoScanIntervalMinutes(this.settings.autoScanIntervalMinutes) * 60 * 1000;
    this.autoScanIntervalId = window.setInterval(() => {
      runAsync(() => this.scanTodaysGitSheet({ trigger: "interval" }));
    }, intervalMs);
    this.registerInterval(this.autoScanIntervalId);
  }

  clearAutoScanTimer() {
    if (!this.autoScanIntervalId) {
      return;
    }

    window.clearInterval(this.autoScanIntervalId);
    this.autoScanIntervalId = null;
  }

  scheduleStartupScan() {
    if (this.settings.scanOnStartup === false) {
      return;
    }

    this.app.workspace.onLayoutReady(() => {
      this.startupScanTimeoutId = window.setTimeout(() => {
        runAsync(() => this.scanTodaysGitSheet({ trigger: "startup" }));
      }, 1000);
      this.register(() => window.clearTimeout(this.startupScanTimeoutId));
    });
  }

  registerViewOpenScanHandler() {
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        runAsync(() => this.maybeScanOnViewOpen(file));
      })
    );
  }

  async maybeScanOnViewOpen(file: unknown) {
    if (this.settings.scanOnViewOpen === false || !(file instanceof TFile) || file.extension !== "md") {
      return;
    }

    if (Date.now() < this.suppressViewOpenScanUntil) {
      return;
    }

    if (!this.isScanDataStale()) {
      return;
    }

    if (Date.now() - this.lastViewOpenScanRequestedAt < VIEW_OPEN_SCAN_DEBOUNCE_MS) {
      return;
    }

    const isTodaysDailyNote = file.path === this.getTodaysDailyNotePath();
    let isLjOsView = isTodaysDailyNote;

    if (!isLjOsView) {
      try {
        const content = await this.app.vault.cachedRead(file);
        isLjOsView = findSectionRanges(content, this.settings.dailySectionHeading).length > 0;
      } catch {
        return;
      }
    }

    if (!isLjOsView || !this.isScanDataStale()) {
      return;
    }

    this.lastViewOpenScanRequestedAt = Date.now();
    this.scheduleBackgroundScan("view-open");
  }

  scheduleBackgroundScan(trigger: ScanTrigger) {
    const timeoutId = window.setTimeout(() => {
      runAsync(() => this.scanTodaysGitSheet({ trigger }));
    }, 250);

    this.register(() => window.clearTimeout(timeoutId));
  }

  isScanDataStale() {
    const lastSuccessfulAt = this.scanState.lastSuccessfulScanCompletedAt || this.scanState.lastScanCompletedAt;
    if (!lastSuccessfulAt) {
      return true;
    }

    const lastSuccessfulMs = Date.parse(lastSuccessfulAt);
    if (!Number.isFinite(lastSuccessfulMs)) {
      return true;
    }

    return Date.now() - lastSuccessfulMs >= this.getFreshnessThresholdMs();
  }

  getFreshnessThresholdMs() {
    return Math.max(
      MIN_AUTO_SCAN_INTERVAL_MINUTES,
      normalizeAutoScanIntervalMinutes(this.settings.autoScanIntervalMinutes)
    ) * 60 * 1000;
  }

  wasScanCompletedRecently(thresholdMs: number): boolean {
    const completedAt = this.scanState.lastScanCompletedAt;
    const completedMs = Date.parse(completedAt || "");
    return Number.isFinite(completedMs) && Date.now() - completedMs < thresholdMs;
  }

  completeScanState(gitSheet: unknown, startedAtMs: number) {
    const metadata = getGitSheetMetadata(gitSheet);
    const status = formatCompletedScanStatus(metadata);

    this.updateScanState({
      isScanRunning: false,
      lastScanCompletedAt: metadata.scanCompletedAt || new Date().toISOString(),
      lastSuccessfulScanCompletedAt: metadata.scanCompletedAt || new Date().toISOString(),
      lastScanDurationMs: metadata.durationMs || Date.now() - startedAtMs,
      lastScanTrigger: metadata.scanTrigger,
      lastRepoCount: metadata.repoCount,
      lastScannedRepoCount: metadata.scannedRepoCount,
      lastSkippedRepoCount: metadata.skippedRepoCount,
      lastFailedRepoCount: metadata.failedRepoCount,
      lastScanTimedOut: metadata.timedOut,
      lastScanStatus: status,
    });
  }

  updateScanState(patch: Partial<ScanState>) {
    this.scanState = normalizeScanState(Object.assign({}, this.scanState, patch));
    this.settings.scanState = this.scanState;
    void this.saveData(this.settings).catch((error) => console.error("Failed to save LJ OS scan state", error));
    this.refreshSettingsDisplay();
  }

  refreshSettingsDisplay() {
    const containerEl = this.settingTab && this.settingTab.containerEl;

    if (containerEl && typeof containerEl.isShown === "function" && containerEl.isShown()) {
      this.settingTab.display();
    }
  }
};

class LjOsSettingTab extends PluginSettingTab {
  plugin: LjOsPlugin;

  constructor(app: App, plugin: LjOsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    const scanRoots = normalizeRepoPaths(this.plugin.settings.scanRoots);
    const trackedRepoPaths = normalizeRepoPaths(this.plugin.settings.trackedRepoPaths);

    new Setting(containerEl).setName("Overview").setHeading();
    new Setting(containerEl).setName("Setup").setHeading();

    renderSetupCard(containerEl, this.plugin, scanRoots, trackedRepoPaths);

    renderFullWidthPathTextareaSetting(containerEl, {
      label: "Scan roots",
      description: "Folders or drives LJ OS searches for Git repositories. Example: G:\\.",
      placeholder: "G:\\\nC:\\Repos",
      rows: 1,
      value: formatRepoPathsForSettings(this.plugin.settings.scanRoots),
      onChange: async (value) => {
        this.plugin.settings.scanRoots = normalizeRepoPaths(value);
        await this.plugin.saveSettings();
      },
    });

    new Setting(containerEl)
      .setName("Git Wall data folder")
      .setDesc("Vault-relative folder where LJ OS stores generated Git activity JSON.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.dynoSheetFolder)
          .setValue(this.plugin.settings.dynoSheetFolder)
          .onChange((value) => {
            runAsync(async () => {
              this.plugin.settings.dynoSheetFolder = sanitizeFolderSetting(value, DEFAULT_SETTINGS.dynoSheetFolder);
              await this.plugin.saveSettings();
            });
          })
      );

    new Setting(containerEl)
      .setName("Daily note folder")
      .setDesc("Vault-relative folder where dated notes are created or updated.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.dailyNoteFolder)
          .setValue(this.plugin.settings.dailyNoteFolder)
          .onChange((value) => {
            runAsync(async () => {
              this.plugin.settings.dailyNoteFolder = sanitizeFolderSetting(value, DEFAULT_SETTINGS.dailyNoteFolder);
              await this.plugin.saveSettings();
            });
          })
      );

    new Setting(containerEl).setName("Tracked Repositories").setHeading();

    renderFullWidthPathTextareaSetting(containerEl, {
      label: "Repositories to scan",
      description: "Validated Git repos LJ OS scans automatically.",
      placeholder: "G:\\obsidian-lj-os-plugin\nG:\\CannabisMath\nG:\\trackingthc.com",
      rows: 3,
      value: formatRepoPathsForSettings(this.plugin.settings.trackedRepoPaths),
      onChange: async (value) => {
        this.plugin.settings.trackedRepoPaths = normalizeRepoPaths(value);
        await this.plugin.saveSettings();
      },
    });

    new Setting(containerEl).setName("Automation").setHeading();

    renderScanStatusSummary(containerEl, this.plugin, trackedRepoPaths);

    new Setting(containerEl)
      .setName("Scan on startup")
      .setDesc("Quietly scan enabled tracked repos shortly after Obsidian finishes loading.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.scanOnStartup !== false).onChange((value) => {
          runAsync(async () => {
            this.plugin.settings.scanOnStartup = value;
            await this.plugin.saveSettings();
          });
        })
      );

    new Setting(containerEl)
      .setName("Auto-scan while Obsidian is open")
      .setDesc("Run quiet interval scans in the background. Manual scan remains available as a fallback.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoScanEnabled !== false).onChange((value) => {
          runAsync(async () => {
            this.plugin.settings.autoScanEnabled = value;
            await this.plugin.saveSettings();
            this.plugin.setupAutoScanTimer();
            this.display();
          });
        })
      );

    if (this.plugin.settings.autoScanEnabled !== false) {
      new Setting(containerEl)
        .setName("Scan interval in minutes")
        .setDesc(`Minimum ${MIN_AUTO_SCAN_INTERVAL_MINUTES} minutes. This controls interval scans and view-open freshness.`)
        .addText((text) =>
          text
            .setPlaceholder(String(DEFAULT_SETTINGS.autoScanIntervalMinutes))
            .setValue(String(normalizeAutoScanIntervalMinutes(this.plugin.settings.autoScanIntervalMinutes)))
            .onChange((value) => {
              runAsync(async () => {
                this.plugin.settings.autoScanIntervalMinutes = normalizeAutoScanIntervalMinutes(value);
                await this.plugin.saveSettings();
                this.plugin.setupAutoScanTimer();
              });
            })
        );
    }

    new Setting(containerEl)
      .setName("Refresh in background when view opens")
      .setDesc("Shows cached data immediately, then quietly refreshes scan data in the background.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.scanOnViewOpen !== false).onChange((value) => {
          runAsync(async () => {
            this.plugin.settings.scanOnViewOpen = value;
            await this.plugin.saveSettings();
          });
        })
      );

    new Setting(containerEl)
      .setName("Scan repositories now")
      .setDesc("Runs a scan now. Normally LJ OS updates automatically in the background.")
      .addButton((button) =>
        button.setButtonText("Scan now").setCta().onClick(() => {
          runAsync(() => this.plugin.scanTodaysGitSheet({ trigger: "manual", showNotice: true }));
        })
      );

    new Setting(containerEl).setName("Dashboard Layout").setHeading();

    renderSectionOrderEditor(containerEl, this.plugin);

    new Setting(containerEl).setName("Customize Display").setHeading();

    new Setting(containerEl)
      .setName("Use emoji")
      .setDesc("Emoji mode affects rendered output only. It does not rewrite saved title fields.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.useEmoji !== false).onChange((value) => {
          runAsync(async () => {
            this.plugin.settings.useEmoji = value;
            await this.plugin.saveSettings();
          });
        })
      );

    new Setting(containerEl)
      .setName("Show daily activity bar")
      .setDesc("Show a compact timeline of when activity happened today.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showDailyActivityBar !== false).onChange((value) => {
          runAsync(async () => {
            this.plugin.settings.showDailyActivityBar = value;
            await this.plugin.saveSettings();
            this.display();
          });
        })
      );

    if (this.plugin.settings.showDailyActivityBar !== false) {
      new Setting(containerEl)
        .setName("Show weather icon")
        .setDesc("Add a subtle weather emoji before the daily activity bar when weather data is available.")
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.settings.showActivityWeatherIcon === true).onChange((value) => {
            runAsync(async () => {
              this.plugin.settings.showActivityWeatherIcon = value;
              this.plugin.activityWeatherCache = null;
              await this.plugin.saveSettings();
              this.display();
            });
          })
        );

      if (this.plugin.settings.showActivityWeatherIcon === true) {
        new Setting(containerEl)
          .setName("Weather latitude")
          .setDesc("Optional decimal latitude used only for the weather icon. Las Vegas example: enter 36.1699 from 36.1699, -115.1398.")
          .addText((text) =>
            text
              .setPlaceholder("37.7749")
              .setValue(this.plugin.settings.activityWeatherLatitude)
              .onChange((value) => {
                runAsync(async () => {
                  this.plugin.settings.activityWeatherLatitude = sanitizeCoordinateSetting(value);
                  this.plugin.activityWeatherCache = null;
                  await this.plugin.saveSettings();
                });
              })
          );

        new Setting(containerEl)
          .setName("Weather longitude")
          .setDesc("Optional decimal longitude used only for the weather icon. Las Vegas example: enter -115.1398 from 36.1699, -115.1398.")
          .addText((text) =>
            text
              .setPlaceholder("-122.4194")
              .setValue(this.plugin.settings.activityWeatherLongitude)
              .onChange((value) => {
                runAsync(async () => {
                  this.plugin.settings.activityWeatherLongitude = sanitizeCoordinateSetting(value);
                  this.plugin.activityWeatherCache = null;
                  await this.plugin.saveSettings();
                });
              })
          );
      }

      new Setting(containerEl)
        .setName("Show moon phase icon")
        .setDesc("Add a subtle moon phase emoji after the daily activity bar.")
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.settings.showActivityMoonIcon === true).onChange((value) => {
            runAsync(async () => {
              this.plugin.settings.showActivityMoonIcon = value;
              await this.plugin.saveSettings();
            });
          })
        );

      new Setting(containerEl)
        .setName("Show 3-day activity view")
        .setDesc("Show compact activity bars for the last 3 cached days.")
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.settings.showThreeDayActivity === true).onChange((value) => {
            runAsync(async () => {
              this.plugin.settings.showThreeDayActivity = value;
              if (value) {
                this.plugin.settings.showSevenDayActivity = false;
              }
              await this.plugin.saveSettings();
              this.display();
            });
          })
        );

      new Setting(containerEl)
        .setName("Show 7-day activity view")
        .setDesc("Show compact activity bars for the last 7 cached days.")
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.settings.showSevenDayActivity === true).onChange((value) => {
            runAsync(async () => {
              this.plugin.settings.showSevenDayActivity = value;
              if (value) {
                this.plugin.settings.showThreeDayActivity = false;
              }
              await this.plugin.saveSettings();
              this.display();
            });
          })
        );
    }

    new Setting(containerEl)
      .setName("Show summary section")
      .setDesc("Render the summary section.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showSummary !== false).onChange((value) => {
          runAsync(async () => {
            this.plugin.settings.showSummary = value;
            await this.plugin.saveSettings();
            this.display();
          });
        })
      );

    if (this.plugin.settings.showSummary !== false) {
      new Setting(containerEl)
        .setName("Summary style")
        .setDesc("Choose how the summary is rendered.")
        .addDropdown((dropdown) =>
          dropdown
            .addOption("callout", "Callout")
            .addOption("scoreboard", "Scoreboard")
            .addOption("pit-wall", "Pit Wall")
            .setValue(normalizeSummaryStyle(this.plugin.settings.summaryStyle))
            .onChange((value) => {
              runAsync(async () => {
                this.plugin.settings.summaryStyle = normalizeSummaryStyle(value);
                await this.plugin.saveSettings();
              });
            })
        );
    }

    new Setting(containerEl)
      .setName("Show repository section")
      .setDesc("Render the repository section.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showRepoTable !== false).onChange((value) => {
          runAsync(async () => {
            this.plugin.settings.showRepoTable = value;
            await this.plugin.saveSettings();
            this.display();
          });
        })
      );

    if (this.plugin.settings.showRepoTable !== false) {
      const repoView = normalizeRepoView(this.plugin.settings.repoView);

      new Setting(containerEl)
        .setName("Repo view")
        .setDesc("Choose how repositories are rendered.")
        .addDropdown((dropdown) =>
          dropdown
            .addOption("table", "Table")
            .addOption("status-cards", "Status Cards")
            .setValue(repoView)
            .onChange((value) => {
              runAsync(async () => {
                this.plugin.settings.repoView = normalizeRepoView(value);
                await this.plugin.saveSettings();
                this.display();
              });
            })
        );

      if (repoView === "table") {
        new Setting(containerEl)
          .setName("Table format")
          .setDesc("Choose how many columns the repository table includes.")
          .addDropdown((dropdown) =>
            dropdown
              .addOption("compact", "Compact")
              .addOption("standard", "Standard")
              .addOption("detailed", "Detailed")
              .addOption("emoji-board", "Emoji board")
              .setValue(normalizeTableFormat(this.plugin.settings.tableFormat))
              .onChange((value) => {
                runAsync(async () => {
                  this.plugin.settings.tableFormat = normalizeTableFormat(value);
                  await this.plugin.saveSettings();
                });
              })
          );
      }
    }

    new Setting(containerEl)
      .setName("Show tidy-up section")
      .setDesc("Render the tidy-up section.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showTidyQueue !== false).onChange((value) => {
          runAsync(async () => {
            this.plugin.settings.showTidyQueue = value;
            await this.plugin.saveSettings();
            this.display();
          });
        })
      );

    if (this.plugin.settings.showTidyQueue !== false) {
      new Setting(containerEl)
        .setName("Tidy view")
        .setDesc("Choose how tidy-up work is rendered.")
        .addDropdown((dropdown) =>
          dropdown
            .addOption("queue", "Queue")
            .addOption("shutdown-checklist", "Shutdown Checklist")
            .setValue(normalizeTidyView(this.plugin.settings.tidyView))
            .onChange((value) => {
              runAsync(async () => {
                this.plugin.settings.tidyView = normalizeTidyView(value);
                await this.plugin.saveSettings();
              });
            })
        );
    }

    new Setting(containerEl).setName("Customize Labels").setHeading();

    new Setting(containerEl)
      .setName("Show label options")
      .setDesc("Show title and section-name fields.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showAdvancedSettings === true).onChange((value) => {
          runAsync(async () => {
            this.plugin.settings.showAdvancedSettings = value;
            await this.plugin.saveSettings();
            this.display();
          });
        })
      );

    if (this.plugin.settings.showAdvancedSettings) {
      new Setting(containerEl)
      .setName("Daily section heading")
      .setDesc("Exact Markdown heading used to find and replace the existing section.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.dailySectionHeading)
          .setValue(this.plugin.settings.dailySectionHeading)
          .onChange((value) => {
            runAsync(async () => {
              this.plugin.settings.dailySectionHeading = value.trim() || DEFAULT_SETTINGS.dailySectionHeading;
              await this.plugin.saveSettings();
            });
          })
      );

    new Setting(containerEl)
      .setName("Summary title")
      .setDesc("Title shown in the summary callout.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.summaryTitle)
          .setValue(this.plugin.settings.summaryTitle)
          .onChange((value) => {
            runAsync(async () => {
              this.plugin.settings.summaryTitle = sanitizeTextSetting(value, DEFAULT_SETTINGS.summaryTitle);
              await this.plugin.saveSettings();
            });
          })
      );

    new Setting(containerEl)
      .setName("Repository section title")
      .setDesc("Title shown above the repository section.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.repoSectionTitle)
          .setValue(this.plugin.settings.repoSectionTitle)
          .onChange((value) => {
            runAsync(async () => {
              this.plugin.settings.repoSectionTitle = sanitizeTextSetting(value, DEFAULT_SETTINGS.repoSectionTitle);
              await this.plugin.saveSettings();
            });
          })
      );

    new Setting(containerEl)
      .setName("Tidy-up section title")
      .setDesc("Title shown above the tidy-up section when using queue view.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.tidySectionTitle)
          .setValue(this.plugin.settings.tidySectionTitle)
          .onChange((value) => {
            runAsync(async () => {
              this.plugin.settings.tidySectionTitle = sanitizeTextSetting(value, DEFAULT_SETTINGS.tidySectionTitle);
              await this.plugin.saveSettings();
            });
          })
      );

    new Setting(containerEl)
      .setName("Reset labels")
      .setDesc("Restore the default Git Wall headings and titles.")
      .addButton((button) =>
        button.setButtonText("Reset labels").setCta().onClick(() => {
          runAsync(async () => {
            this.plugin.settings.dailySectionHeading = DEFAULT_SETTINGS.dailySectionHeading;
            this.plugin.settings.summaryTitle = DEFAULT_SETTINGS.summaryTitle;
            this.plugin.settings.repoSectionTitle = DEFAULT_SETTINGS.repoSectionTitle;
            this.plugin.settings.tidySectionTitle = DEFAULT_SETTINGS.tidySectionTitle;
            await this.plugin.saveSettings();
            this.display();
          });
        })
      );
    }

    new Setting(containerEl).setName("Advanced Scanning").setHeading();

    new Setting(containerEl)
      .setName("Show advanced scan options")
      .setDesc("Optional scan limits and discovery details.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showAdvancedScanningSettings === true).onChange((value) => {
          runAsync(async () => {
            this.plugin.settings.showAdvancedScanningSettings = value;
            await this.plugin.saveSettings();
            this.display();
          });
        })
      );

    if (this.plugin.settings.showAdvancedScanningSettings) {
      new Setting(containerEl)
        .setName("Max scan duration seconds")
        .setDesc("Default target is 30 seconds. If the budget is exceeded, LJ OS saves useful partial data and records warnings.")
        .addText((text) =>
          text
            .setPlaceholder(String(DEFAULT_SETTINGS.maxScanDurationSeconds))
            .setValue(String(normalizeMaxScanDurationSeconds(this.plugin.settings.maxScanDurationSeconds)))
            .onChange((value) => {
              runAsync(async () => {
                this.plugin.settings.maxScanDurationSeconds = normalizeMaxScanDurationSeconds(value);
                await this.plugin.saveSettings();
              });
            })
        );

      renderAdvancedScanningDetails(containerEl);
    }
  }
}

function renderSetupCard(containerEl: HTMLElement, plugin: LjOsPlugin, scanRoots: string[], trackedRepoPaths: string[]) {
  const hasTrackedRepos = trackedRepoPaths.length > 0;
  const panel = createCompactPanel(containerEl, hasTrackedRepos ? "Setup Complete ☑️" : "Git Started");
  const copy = activeDocument.createElement("p");
  copy.textContent = hasTrackedRepos
    ? `LJ OS is tracking ${trackedRepoPaths.length} repos. It will keep cached Git Wall data fresh in the background.`
    : "Point LJ OS at the folders or drives where your Git repos live. LJ OS will discover repos, track the ones you enable, then keep your Git Wall updated automatically.";
  panel.appendChild(copy);

  if (!hasTrackedRepos) {
    const steps = activeDocument.createElement("ol");
    for (const step of [
      "Add scan roots or exact repo paths.",
      "Discover repositories.",
      "Review tracked repositories.",
      "Enable automation.",
      "Run first scan.",
    ]) {
      const item = activeDocument.createElement("li");
      item.textContent = step;
      steps.appendChild(item);
    }
    panel.appendChild(steps);
  }

  const hint = activeDocument.createElement("p");
  hint.textContent = "Fastest setup: add your main repo folder or drive, click Discover repositories, then click Scan now.";
  hint.addClass("lj-os-settings-no-margin-bottom");
  panel.appendChild(hint);

  const actions = activeDocument.createElement("div");
  actions.addClass("lj-os-settings-actions");
  panel.appendChild(actions);

  actions.appendChild(createActionButton("Discover repositories", () => plugin.discoverRepositories({ showNotice: true }), true));

  if (hasTrackedRepos) {
    actions.appendChild(createActionButton("Scan now", () => plugin.scanTodaysGitSheet({ trigger: "manual", showNotice: true }), false));
  }

  if (scanRoots.length > 0 || trackedRepoPaths.length > 0) {
    const counts = activeDocument.createElement("p");
    counts.textContent = `${scanRoots.length} scan roots · ${trackedRepoPaths.length} tracked repos`;
    counts.addClass("lj-os-settings-muted");
    counts.addClass("lj-os-settings-counts");
    panel.appendChild(counts);
  }
}

function renderFullWidthPathTextareaSetting(containerEl: HTMLElement, options: PathTextareaOptions) {
  const panel = createCompactPanel(containerEl, options.label);
  const description = activeDocument.createElement("div");
  description.textContent = options.description;
  description.addClass("lj-os-settings-muted");
  description.addClass("lj-os-settings-description");
  panel.appendChild(description);

  const textarea = activeDocument.createElement("textarea");
  textarea.rows = options.rows;
  textarea.placeholder = options.placeholder;
  textarea.value = options.value;
  textarea.addClass("lj-os-settings-textarea");
  textarea.addEventListener("change", () => {
    runAsync(() => options.onChange(textarea.value));
  });
  panel.appendChild(textarea);
}

function renderScanStatusSummary(containerEl: HTMLElement, plugin: LjOsPlugin, trackedRepoPaths: string[]) {
  const state = plugin.scanState;
  const panel = createCompactPanel(containerEl, "Scan Status");
  const primary = activeDocument.createElement("p");
  const lastScan = formatTimestampForSettings(state.lastSuccessfulScanCompletedAt || state.lastScanCompletedAt);
  const duration = formatScanStateDuration(state);
  const status = formatScanStatusLabel(state.lastScanStatus);
  const pieces = [status];

  if (duration !== "Not available") {
    pieces.push(duration);
  }

  if (lastScan !== "Not available") {
    pieces.push(`Last scan: ${lastScan}`);
  }

  primary.textContent = pieces.join(" · ");
  primary.addClass("lj-os-settings-primary-status");
  panel.appendChild(primary);

  const secondary = activeDocument.createElement("p");
  const failedCount = toNumber(state.lastFailedRepoCount);
  const skippedCount = toNumber(state.lastSkippedRepoCount);
  const trigger = formatScalar(state.lastScanTrigger);
  const repoCount = trackedRepoPaths.length;
  const secondaryPieces = [`Tracked repos: ${repoCount} enabled`, `Failed: ${failedCount}`, `Skipped: ${skippedCount}`];

  if (trigger) {
    secondaryPieces.push(`Trigger: ${trigger}`);
  }

  if (state.lastScanTimedOut) {
    secondaryPieces.push("Timed out");
  }

  secondary.textContent = secondaryPieces.join(" · ");
  secondary.addClass("lj-os-settings-secondary-status");
  panel.appendChild(secondary);
}

function renderSectionOrderEditor(containerEl: HTMLElement, plugin: LjOsPlugin) {
  const order = normalizeSectionOrder(plugin.settings.sectionOrder);
  const panel = createCompactPanel(containerEl, "Section order");
  const list = activeDocument.createElement("div");
  list.addClass("lj-os-settings-list");
  panel.appendChild(list);

  order.forEach((sectionId, index) => {
    const section = getDashboardSection(sectionId);
    const row = activeDocument.createElement("div");
    row.addClass("lj-os-settings-row");
    list.appendChild(row);

    const label = activeDocument.createElement("div");
    label.textContent = `${index + 1}. ${section.label}`;
    label.addClass("lj-os-settings-row-label");
    row.appendChild(label);

    const actions = activeDocument.createElement("div");
    actions.addClass("lj-os-settings-row-actions");
    row.appendChild(actions);

    const moveUpButton = createActionButton(
      "Move up",
      async () => {
        plugin.settings.sectionOrder = moveSectionOrderItem(plugin.settings.sectionOrder, index, -1);
        await plugin.saveSettings();
        plugin.settingTab.display();
      },
      index > 0
    );
    moveUpButton.disabled = index === 0;
    actions.appendChild(moveUpButton);

    const moveDownButton = createActionButton(
      "Move down",
      async () => {
        plugin.settings.sectionOrder = moveSectionOrderItem(plugin.settings.sectionOrder, index, 1);
        await plugin.saveSettings();
        plugin.settingTab.display();
      },
      index < order.length - 1
    );
    moveDownButton.disabled = index === order.length - 1;
    actions.appendChild(moveDownButton);
  });

  const resetRow = activeDocument.createElement("div");
  resetRow.addClass("lj-os-settings-reset-row");
  resetRow.appendChild(
    createActionButton(
      "Reset layout",
      async () => {
        plugin.settings.sectionOrder = DEFAULT_SECTION_ORDER.slice();
        await plugin.saveSettings();
        plugin.settingTab.display();
      },
      true
    )
  );
  panel.appendChild(resetRow);
}

function renderAdvancedScanningDetails(containerEl: HTMLElement) {
  const panel = createCompactPanel(containerEl, "Discovery Details");
  const details = activeDocument.createElement("p");
  details.textContent = `Discovery searches scan roots up to ${DEFAULT_DISCOVERY_DEPTH} folders deep and stops after ${DEFAULT_DISCOVERY_MAX_DIRECTORIES} folders or the scan budget. It skips noisy folders such as node_modules, the vault config folder, Git internals, AppData, Windows, Program Files, $Recycle.Bin, and System Volume Information.`;
  details.addClass("lj-os-settings-details");
  panel.appendChild(details);
}

function createCompactPanel(containerEl: HTMLElement, title: string): HTMLElement {
  const panel = activeDocument.createElement("div");
  panel.addClass("lj-os-settings-card");

  const heading = activeDocument.createElement("div");
  heading.textContent = title;
  heading.addClass("lj-os-settings-card-heading");
  panel.appendChild(heading);
  containerEl.appendChild(panel);
  return panel;
}

function createActionButton(label: string, onClick: AsyncAction, isPrimary: boolean): HTMLButtonElement {
  const button = activeDocument.createElement("button");
  button.type = "button";
  button.textContent = label;
  if (isPrimary) {
    button.classList.add("mod-cta");
  }
  button.addEventListener("click", () => {
    void Promise.resolve(onClick()).catch((error) => console.error("LJ OS action failed", error));
  });
  return button;
}

function getDashboardSection(sectionId) {
  return DASHBOARD_SECTIONS.find((section) => section.id === sectionId) || { id: sectionId, label: sectionId };
}

function normalizeSectionOrder(value) {
  const rawOrder = Array.isArray(value) ? value : [];
  const knownIds = new Set(DASHBOARD_SECTIONS.map((section) => section.id));
  const seen = new Set();
  const order = [];

  for (const rawSectionId of rawOrder) {
    const sectionId = formatScalar(rawSectionId);
    if (!knownIds.has(sectionId) || seen.has(sectionId)) {
      continue;
    }

    seen.add(sectionId);
    order.push(sectionId);
  }

  for (const sectionId of DEFAULT_SECTION_ORDER) {
    if (!seen.has(sectionId)) {
      seen.add(sectionId);
      order.push(sectionId);
    }
  }

  return order;
}

function moveSectionOrderItem(order, index, direction) {
  const normalizedOrder = normalizeSectionOrder(order);
  const nextIndex = index + direction;

  if (nextIndex < 0 || nextIndex >= normalizedOrder.length) {
    return normalizedOrder;
  }

  const movedOrder = normalizedOrder.slice();
  const [sectionId] = movedOrder.splice(index, 1);
  movedOrder.splice(nextIndex, 0, sectionId);
  return movedOrder;
}

function formatScanStatusLabel(value) {
  const text = formatScalar(value);

  if (!text) {
    return "Not scanned yet";
  }

  return text.charAt(0).toUpperCase() + text.slice(1);
}

function renderGitSheetMarkdown(gitSheet, settingsOrHeading) {
  const renderSettings = normalizeRenderSettings(settingsOrHeading);
  const useEmoji = renderSettings.useEmoji !== false;
  const summary = gitSheet.summary || {};
  const repos = Array.isArray(gitSheet.repos) ? gitSheet.repos : [];
  const dirtyRepos = repos.filter((repo) => Boolean(repo.dirty));
  const reposWithNotes = repos.filter((repo) => hasNotes(repo.notes));
  const sheetNotes = normalizeNotes(gitSheet.notes);
  const summaryTitle = formatTitle(renderSettings.summaryTitle, DEFAULT_SETTINGS.summaryTitle, useEmoji);
  const repoSectionTitle = formatTitle(renderSettings.repoSectionTitle, DEFAULT_SETTINGS.repoSectionTitle, useEmoji);
  const tidySectionTitle = formatTitle(renderSettings.tidySectionTitle, DEFAULT_SETTINGS.tidySectionTitle, useEmoji);
  const summaryStyle = normalizeSummaryStyle(renderSettings.summaryStyle);
  const repoView = normalizeRepoView(renderSettings.repoView);
  const tidyView = normalizeTidyView(renderSettings.tidyView);
  const tableFormat = normalizeTableFormat(renderSettings.tableFormat);
  const showDailyActivityBar = renderSettings.showDailyActivityBar !== false;
  const showActivityWeatherIcon = renderSettings.showActivityWeatherIcon === true;
  const showActivityMoonIcon = renderSettings.showActivityMoonIcon === true;
  const showThreeDayActivity = renderSettings.showThreeDayActivity === true;
  const showSevenDayActivity = renderSettings.showSevenDayActivity === true;
  const showSummary = renderSettings.showSummary !== false;
  const showRepoTable = renderSettings.showRepoTable !== false;
  const showTidyQueue = renderSettings.showTidyQueue !== false;
  const lines = [];
  const blocks = [];

  lines.push((renderSettings.dailySectionHeading || DEFAULT_SETTINGS.dailySectionHeading).trim());
  lines.push("");
  lines.push(`Generated: ${formatGeneratedAt(gitSheet.generatedAt)}`);
  lines.push(...formatScanMetadataLines(gitSheet));

  for (const sectionId of normalizeSectionOrder(renderSettings.sectionOrder)) {
    if (sectionId === "activityBar" && showDailyActivityBar) {
      blocks.push(renderActivitySectionLines(gitSheet, {
        recentGitSheets: renderSettings.recentGitSheets,
        showWeatherIcon: showActivityWeatherIcon,
        weatherIcon: renderSettings.activityWeatherIcon,
        showMoonIcon: showActivityMoonIcon,
        showThreeDayActivity,
        showSevenDayActivity,
      }));
    } else if (sectionId === "gitScoreboard" && showSummary) {
      blocks.push(renderSummaryLines(summary, summaryTitle, useEmoji, summaryStyle));
    } else if (sectionId === "repositoryActivity" && showRepoTable) {
      blocks.push(renderRepoSectionLines(repos, reposWithNotes, repoSectionTitle, useEmoji, repoView, tableFormat));
    } else if (sectionId === "cleanupChecklist" && showTidyQueue) {
      blocks.push(renderTidySectionLines(dirtyRepos, summary, tidySectionTitle, useEmoji, tidyView));
    }
  }

  if (sheetNotes.length > 0) {
    blocks.push(renderScanNotesLines(sheetNotes));
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

function renderMissingGitSheetMarkdown(settingsOrHeading) {
  const renderSettings = normalizeRenderSettings(settingsOrHeading);
  const lines = [
    (renderSettings.dailySectionHeading || DEFAULT_SETTINGS.dailySectionHeading).trim(),
    "",
    "No LJ OS scan data found for today yet. Run `LJ OS: Scan Configured Git Repositories` or enable startup/interval scanning.",
  ];

  return lines.join("\n").trimEnd();
}

function renderDailyActivityBar(timestamps, label = "Today", options = {}) {
  const weatherIcon = getActivityWeatherIcon(options);
  const weatherPrefix = weatherIcon ? `${weatherIcon} ` : "";
  const moonIcon = options.showMoonIcon ? getApproximateMoonPhaseEmoji(options.date || new Date()) : "";
  const bookend = moonIcon ? ` ${moonIcon}` : "";
  return `${formatScalar(label) || "Today"}  ${weatherPrefix}${renderDailyActivityBlocks(timestamps)}${bookend}`;
}

function renderDailyActivityBarFromGitSheet(gitSheet, label = "Today", options = {}) {
  return renderDailyActivityBar(collectGitSheetActivityTimestamps(gitSheet), label, options);
}

function renderActivitySectionLines(gitSheet, options = {}) {
  const showWeatherIcon = options.showWeatherIcon === true;
  const weatherIcon = getActivityWeatherIcon(options);
  const showMoonIcon = options.showMoonIcon === true;
  const lines = ["### Activity", "", renderDailyActivityBarFromGitSheet(gitSheet, "Today", {
    date: getGitSheetActivityDate(gitSheet),
    showWeatherIcon,
    weatherIcon,
    showMoonIcon,
  })];

  if (options.showThreeDayActivity === true) {
    lines.push("", "3-Day", "", ...renderRecentActivityTableLines(gitSheet, {
      dayCount: 3,
      recentGitSheets: options.recentGitSheets,
      showWeatherIcon,
      showMoonIcon,
    }));
  }

  if (options.showSevenDayActivity === true) {
    lines.push("", "7-Day", "", ...renderRecentActivityTableLines(gitSheet, {
      dayCount: 7,
      recentGitSheets: options.recentGitSheets,
      showWeatherIcon,
      showMoonIcon,
    }));
  }

  return lines;
}

function renderRecentActivityTableLines(gitSheet, options = {}) {
  const showWeatherIcon = options.showWeatherIcon === true;
  const showMoonIcon = options.showMoonIcon === true;
  const dayCount = normalizeRecentActivityDayCount(options.dayCount);
  const headers = ["Day"];
  const divider = [":---:"];

  if (showWeatherIcon) {
    headers.push("Weather");
    divider.push(":---:");
  }

  headers.push("Activity");
  divider.push(":---:");

  if (showMoonIcon) {
    headers.push("Moon");
    divider.push(":---:");
  }

  const lines = [toMarkdownTableRow(headers), toMarkdownTableRow(divider)];

  for (const entry of getRecentActivityEntries(gitSheet, options.recentGitSheets, dayCount)) {
    const row = [formatScalar(entry.label) || "Day"];

    if (showWeatherIcon) {
      row.push(getCachedActivityWeatherIcon(entry.gitSheet) || "");
    }

    row.push(renderQuietDailyActivityBlocks(collectGitSheetActivityTimestamps(entry.gitSheet)));

    if (showMoonIcon) {
      row.push(getApproximateMoonPhaseEmoji(entry.date || new Date()));
    }

    lines.push(toMarkdownTableRow(row));
  }

  return lines;
}

function getActivityWeatherIcon(options: UnknownRecord = {}) {
  if (options.showWeatherIcon !== true) {
    return null;
  }

  return formatScalar(options.weatherIcon) || null;
}

function getCachedActivityWeatherIcon(gitSheet: unknown): string | null {
  const sheet = toRecord(gitSheet);
  const activityWeather = toRecord(sheet.activityWeather);

  if (!activityWeather) {
    return null;
  }

  return formatScalar(activityWeather.emoji) || null;
}

function normalizeActivityWeatherRequest(settings: Partial<LjOsSettings> = {}): ActivityWeatherRequest | null {
  if (settings.showDailyActivityBar === false || settings.showActivityWeatherIcon !== true) {
    return null;
  }

  const latitudeText = sanitizeCoordinateSetting(settings.activityWeatherLatitude);
  const longitudeText = sanitizeCoordinateSetting(settings.activityWeatherLongitude);

  if (!latitudeText || !longitudeText) {
    return null;
  }

  const latitude = toOptionalNumber(latitudeText);
  const longitude = toOptionalNumber(longitudeText);

  if (latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  return {
    latitude,
    longitude,
    key: `${latitude.toFixed(4)},${longitude.toFixed(4)}`,
  };
}

async function fetchOpenMeteoActivityWeatherContext(request: ActivityWeatherRequest | null): Promise<ActivityWeatherContext | null> {
  if (!request || typeof requestUrl !== "function") {
    return null;
  }

  try {
    const response = await Promise.race([
      requestUrl({
        url: buildOpenMeteoActivityWeatherUrl(request),
        method: "GET",
      }).catch(() => null),
      delay(ACTIVITY_WEATHER_FETCH_TIMEOUT_MS).then(() => null),
    ]);

    if (!response || response.status < 200 || response.status >= 300) {
      return null;
    }

    const data = toRecord(response.json || JSON.parse(response.text || "{}"));
    const current = toRecord(data.current);
    const activityWeather = mapOpenMeteoWeatherToActivityContext(current.weather_code, current.temperature_2m);

    if (!activityWeather) {
      return null;
    }

    return {
      emoji: activityWeather.emoji,
      label: activityWeather.label,
      source: "open-meteo",
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function buildOpenMeteoActivityWeatherUrl(request: ActivityWeatherRequest): string {
  const params = new URLSearchParams({
    latitude: String(request.latitude),
    longitude: String(request.longitude),
    current: "temperature_2m,weather_code",
    timezone: "auto",
    forecast_days: "1",
  });

  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

function mapOpenMeteoWeatherToActivityContext(weatherCode, temperatureC) {
  const extremeTemperature = getExtremeActivityTemperatureContext(temperatureC);
  if (extremeTemperature) {
    return extremeTemperature;
  }

  const code = toOptionalNumber(weatherCode);
  if (code === null) {
    return null;
  }

  if (code === 0) {
    return { emoji: "☀️", label: "Clear" };
  }

  if (code === 1 || code === 2) {
    return { emoji: "🌤️", label: "Partly cloudy" };
  }

  if (code === 3) {
    return { emoji: "☁️", label: "Cloudy" };
  }

  if (code === 45 || code === 48) {
    return { emoji: "🌫️", label: "Fog" };
  }

  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    return { emoji: "🌦️", label: "Rain" };
  }

  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return { emoji: "🌨️", label: "Snow" };
  }

  if (code >= 95 && code <= 99) {
    return { emoji: "⛈️", label: "Thunderstorm" };
  }

  return null;
}

function getExtremeActivityTemperatureContext(temperatureC) {
  const temperature = toOptionalNumber(temperatureC);

  if (temperature === null) {
    return null;
  }

  if (temperature >= 38) {
    return { emoji: "🔥", label: "Very hot" };
  }

  if (temperature <= -10) {
    return { emoji: "🥶", label: "Very cold" };
  }

  return null;
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, toNumber(ms))));
}

function renderDailyActivityBlocks(timestamps) {
  return getDailyActivityBucketStates(timestamps)
    .map((isActive) => (isActive ? ACTIVITY_BAR_ACTIVE_BLOCK : ACTIVITY_BAR_EMPTY_BLOCK))
    .join("");
}

function renderQuietDailyActivityBlocks(timestamps) {
  return getDailyActivityBucketStates(timestamps)
    .map((isActive) => (isActive ? ACTIVITY_BAR_QUIET_ACTIVE_BLOCK : ACTIVITY_BAR_QUIET_EMPTY_BLOCK))
    .join("");
}

function getDailyActivityBucketStates(timestamps) {
  const activeBuckets = new Array(DAILY_ACTIVITY_BUCKETS.length).fill(false);

  for (const timestamp of normalizeActivityTimestamps(timestamps)) {
    const bucketIndex = getDailyActivityBucketIndex(timestamp);
    if (bucketIndex >= 0) {
      activeBuckets[bucketIndex] = true;
    }
  }

  return activeBuckets;
}

function collectGitSheetActivityTimestamps(gitSheet) {
  const sheet = gitSheet && typeof gitSheet === "object" ? gitSheet : {};
  const timestamps = [];
  appendActivityTimestampValues(timestamps, sheet.activityTimestamps);

  const repos = Array.isArray(sheet.repos) ? sheet.repos : [];
  for (const repo of repos) {
    appendActivityTimestampValues(timestamps, repo && repo.activityTimestamps);
    appendActivityTimestampValues(timestamps, repo && repo.commitTimestamps);
    appendActivityTimestampValues(timestamps, repo && repo.commits);
    appendActivityTimestampValues(timestamps, repo && repo.commitsTodayDetails);
  }

  return timestamps;
}

function appendActivityTimestampValues(target, value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      appendActivityTimestampValues(target, item);
    }
    return;
  }

  const timestamp = normalizeActivityTimestamp(value);
  if (timestamp) {
    target.push(timestamp);
  }
}

function normalizeActivityTimestamps(value) {
  const timestamps = [];
  appendActivityTimestampValues(timestamps, value);
  return timestamps;
}

function normalizeActivityTimestamp(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "object") {
    return normalizeActivityTimestamp(value.timestamp || value.date || value.committedAt || value.authorDate || value.committerDate);
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDailyActivityBucketIndex(timestamp) {
  const hour = timestamp.getHours();

  for (let index = 0; index < DAILY_ACTIVITY_BUCKETS.length; index += 1) {
    const bucket = DAILY_ACTIVITY_BUCKETS[index];
    if (hour >= bucket.startHour && hour < bucket.endHour) {
      return index;
    }
  }

  return -1;
}

function getRecentActivityEntries(todayGitSheet, recentGitSheets, dayCount = 7) {
  const count = normalizeRecentActivityDayCount(dayCount);

  if (Array.isArray(recentGitSheets) && recentGitSheets.length > 0) {
    return recentGitSheets.slice(-count);
  }

  const todayDate = getGitSheetActivityDate(todayGitSheet);
  const todayStamp = formatScalar(todayGitSheet && todayGitSheet.date) || formatLocalDateStamp(todayDate);

  return getRecentLocalDateInfos(count, todayDate).map((dateInfo) =>
    Object.assign({}, dateInfo, {
      gitSheet: dateInfo.dateStamp === todayStamp ? todayGitSheet : null,
    })
  );
}

function normalizeRecentActivityDayCount(value) {
  return Math.max(1, Math.floor(toNumber(value)) || 7);
}

function getRecentActivityDayCount(settings = {}) {
  if (settings.showDailyActivityBar === false) {
    return 0;
  }

  let dayCount = 0;

  if (settings.showThreeDayActivity === true) {
    dayCount = Math.max(dayCount, 3);
  }

  if (settings.showSevenDayActivity === true) {
    dayCount = Math.max(dayCount, 7);
  }

  return dayCount;
}

function getGitSheetActivityDate(gitSheet) {
  return parseLocalDateStamp(gitSheet && gitSheet.date) || new Date();
}

function getApproximateMoonPhaseEmoji(date = new Date()) {
  try {
    const timestampMs = date instanceof Date ? date.getTime() : new Date(date).getTime();
    if (!Number.isFinite(timestampMs)) {
      return "";
    }

    const daysSinceKnownNewMoon = (timestampMs - KNOWN_NEW_MOON_UTC_MS) / 86400000;
    const cyclePosition = ((daysSinceKnownNewMoon % LUNAR_CYCLE_DAYS) + LUNAR_CYCLE_DAYS) % LUNAR_CYCLE_DAYS;
    const phaseIndex = Math.floor(((cyclePosition / LUNAR_CYCLE_DAYS) * MOON_PHASE_EMOJIS.length) + 0.5) % MOON_PHASE_EMOJIS.length;
    return MOON_PHASE_EMOJIS[phaseIndex] || "";
  } catch {
    return "";
  }
}

function formatScanMetadataLines(gitSheet) {
  const metadata = getGitSheetMetadata(gitSheet);
  const lines = [];

  if (metadata.scanCompletedAt) {
    lines.push(`Last scan: ${formatGeneratedAt(metadata.scanCompletedAt)}`);
  }

  const details = [];
  if (metadata.durationMs > 0) {
    details.push(`duration ${formatDurationMs(metadata.durationMs)}`);
  }

  if (metadata.scanTrigger) {
    details.push(`trigger ${metadata.scanTrigger}`);
  }

  if (metadata.timedOut) {
    details.push("timed out");
  } else if (metadata.warnings.length > 0 || metadata.failedRepoCount > 0) {
    details.push("warnings");
  }

  if (details.length > 0) {
    lines.push(`Scan details: ${details.join(" · ")}`);
  }

  return lines;
}

function renderSummaryLines(summary, summaryTitle, useEmoji, summaryStyle) {
  if (summaryStyle === "pit-wall") {
    return formatSummaryPitWall(summary, useEmoji);
  }

  if (summaryStyle === "scoreboard") {
    return formatSummaryScoreboard(summary, useEmoji);
  }

  return formatSummaryCallout(summary, summaryTitle, useEmoji);
}

function formatSummaryCallout(summary, summaryTitle, useEmoji) {
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

function formatSummaryScoreboard(summary, useEmoji) {
  const title = useEmoji ? "### 🎮 Git Scoreboard" : "### Git Scoreboard";
  return [
    title,
    "",
    "| Stat | Value |",
    "| --- | ---: |",
    toMarkdownTableRow([maybeEmoji("🧭", "Repos scanned", useEmoji), formatNumber(summary.reposScanned)]),
    toMarkdownTableRow([maybeEmoji("🛠️", "Repos touched", useEmoji), formatNumber(summary.reposTouchedToday)]),
    toMarkdownTableRow([maybeEmoji("🏁", "Commits", useEmoji), formatNumber(summary.commitsToday)]),
    toMarkdownTableRow([maybeEmoji("🧼", "Tidy-up queue", useEmoji), formatNumber(summary.dirtyRepos)]),
    toMarkdownTableRow([maybeEmoji("🚀", "Unpushed", useEmoji), formatNumber(summary.unpushedCommits)]),
    toMarkdownTableRow([maybeEmoji("📥", "Behind", useEmoji), formatNumber(summary.behindCommits)]),
  ];
}

function formatSummaryPitWall(summary, useEmoji) {
  const title = useEmoji ? "### 🧱 Pit Wall" : "### Pit Wall";
  return [
    title,
    "",
    "| Signal | Status |",
    "| --- | --- |",
    toMarkdownTableRow([maybeEmoji("🏁", "Activity", useEmoji), formatActivityStatus(summary)]),
    toMarkdownTableRow([maybeEmoji("🧼", "Garage", useEmoji), formatGarageStatus(summary)]),
    toMarkdownTableRow([maybeEmoji("🚀", "Launch", useEmoji), formatLaunchStatus(summary)]),
    toMarkdownTableRow([maybeEmoji("📥", "Sync", useEmoji), formatSyncStatus(summary)]),
  ];
}

function getSummaryValues(summary) {
  return [
    formatNumber(summary.reposScanned),
    formatNumber(summary.reposTouchedToday),
    formatNumber(summary.commitsToday),
    formatNumber(summary.dirtyRepos),
    formatNumber(summary.unpushedCommits),
    formatNumber(summary.behindCommits),
  ];
}

function formatActivityStatus(summary) {
  const commitsToday = toNumber(summary.commitsToday);
  const reposTouchedToday = formatNumber(summary.reposTouchedToday);
  const commitLabel = commitsToday === 1 ? "commit" : "commits";

  return `${commitsToday} ${commitLabel} across ${reposTouchedToday} repos`;
}

function formatGarageStatus(summary) {
  const dirtyRepos = toNumber(summary.dirtyRepos);
  return dirtyRepos === 0 ? "All included repos are clean" : `${dirtyRepos} repos need tidy-up`;
}

function formatLaunchStatus(summary) {
  const unpushedCommits = toNumber(summary.unpushedCommits);
  return unpushedCommits === 0 ? "Clear, nothing unpushed" : `${unpushedCommits} unpushed commits`;
}

function formatSyncStatus(summary) {
  const behindCommits = toNumber(summary.behindCommits);
  return behindCommits === 0 ? "Clear, nothing behind" : `${behindCommits} commits behind remote`;
}

function renderRepoSectionLines(repos, reposWithNotes, repoSectionTitle, useEmoji, repoView, tableFormat) {
  if (repoView === "status-cards") {
    return renderRepoStatusCardLines(repos, reposWithNotes, repoSectionTitle, useEmoji);
  }

  return renderRepoTableLines(repos, reposWithNotes, repoSectionTitle, useEmoji, tableFormat);
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

  if (tableFormat === "emoji-board" && useEmoji) {
    lines.push("");
    lines.push("> 🏁 activity · 🧹 tidy needed · ✅ clear · 🚀 unpushed · 📥 behind remote");
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

function renderRepoStatusCardLines(repos, reposWithNotes, repoSectionTitle, useEmoji) {
  const lines = [`### ${repoSectionTitle}`];

  if (repos.length === 0) {
    lines.push("");
    lines.push("> [!success] No repos included");
    lines.push(`> ${formatCommitCount(0)} · ${useEmoji ? "✅ clean" : "clean"} · ${formatUnpushedStatus(0, useEmoji)} · ${formatBehindStatus(0, useEmoji)}  `);
    lines.push("> No commits yet");
  } else {
    for (const repo of repos) {
      lines.push("");
      lines.push(...formatRepoStatusCard(repo, useEmoji));
    }
  }

  appendRepoNotes(lines, reposWithNotes);
  return lines;
}

function formatRepoStatusCard(repo, useEmoji) {
  const callout = isRepoClear(repo) ? "success" : "warning";
  const title = formatRepoTitle(repo);
  const cleanStatus = repo.dirty ? maybeEmoji("🧹", "tidy needed", useEmoji) : maybeEmoji("✅", "clean", useEmoji);

  return [
    `> [!${callout}] ${title}`,
    `> ${maybeEmoji("🏁", formatCommitCount(repo.commitsToday), useEmoji)} · ${cleanStatus} · ${formatUnpushedStatus(repo.unpushedCommits, useEmoji)} · ${formatBehindStatus(repo.behindUpstream, useEmoji)}  `,
    `> ${formatLatestCommit(repo.latestCommit)}`,
  ];
}

function appendRepoNotes(lines, reposWithNotes) {
  if (reposWithNotes.length === 0) {
    return;
  }

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

function renderTidySectionLines(dirtyRepos, summary, tidySectionTitle, useEmoji, tidyView) {
  if (tidyView === "shutdown-checklist") {
    return renderShutdownChecklistLines(dirtyRepos, summary, useEmoji);
  }

  return renderTidyQueueLines(dirtyRepos, tidySectionTitle, useEmoji);
}

function renderScanNotesLines(notes) {
  const lines = ["### Scan Notes", ""];

  for (const note of notes) {
    lines.push(`- ${formatScalar(note)}`);
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

function renderShutdownChecklistLines(dirtyRepos, summary, useEmoji) {
  const lines = [useEmoji ? "### 🧹 Shutdown Checklist" : "### Shutdown Checklist", ""];
  const unpushedCommits = toNumber(summary.unpushedCommits);
  const behindCommits = toNumber(summary.behindCommits);

  for (const repo of dirtyRepos) {
    const branch = repo.branch ? ` \`${formatInlineCode(repo.branch)}\`` : "";
    lines.push(`- [ ] ${maybeEmoji("🧹", `${formatScalar(repo.name || "Unnamed repo")}${branch} needs tidy-up`, useEmoji)}`);
  }

  if (unpushedCommits === 0) {
    lines.push(`- [x] ${maybeEmoji("🚀", "No unpushed commits", useEmoji)}`);
  } else {
    lines.push(`- [ ] ${maybeEmoji("🚀", `${unpushedCommits} unpushed commits need push review`, useEmoji)}`);
  }

  if (behindCommits === 0) {
    lines.push(`- [x] ${maybeEmoji("📥", "No repos behind remote", useEmoji)}`);
  } else {
    lines.push(`- [ ] ${maybeEmoji("📥", `${behindCommits} commits behind remote need pull/sync review`, useEmoji)}`);
  }

  if (dirtyRepos.length === 0 && unpushedCommits === 0 && behindCommits === 0) {
    lines.push(`- [x] ${maybeEmoji("✅", "Garage closed clean", useEmoji)}`);
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

async function scanConfiguredRepositories(configuredPaths, dateStamp, options = {}) {
  const repoPaths = normalizeRepoPaths(configuredPaths);
  const repos = [];
  const warnings = [];
  const scanStartedAt = new Date().toISOString();
  const scanStartedAtMs = Date.now();
  const maxDurationMs = normalizeMaxScanDurationSeconds(options.maxDurationSeconds) * 1000;
  const context = {
    scanStartedAtMs,
    deadlineMs: scanStartedAtMs + maxDurationMs,
    currentRepoDeadlineMs: null,
    timedOut: false,
    warnings,
  };
  let scannedRepoCount = 0;
  let skippedRepoCount = 0;
  let failedRepoCount = 0;

  for (let index = 0; index < repoPaths.length; index += 1) {
    const repoPath = repoPaths[index];

    if (!hasScanBudget(context)) {
      context.timedOut = true;
      const remainingCount = repoPaths.length - index;
      skippedRepoCount += remainingCount;
      warnings.push(`Scan budget exceeded before ${remainingCount} configured repo${remainingCount === 1 ? "" : "s"} could be scanned.`);
      break;
    }

    const remainingRepoCount = repoPaths.length - index;
    context.currentRepoDeadlineMs = Math.min(context.deadlineMs, Date.now() + getPerRepoBudgetMs(context, remainingRepoCount));

    let result;
    try {
      result = await scanLocalGitRepo(repoPath, dateStamp, Object.assign({}, options, { context }));
    } catch (error) {
      result = { note: `${formatLocalPath(repoPath)}: ${formatGitError(error)}`, failed: true };
    } finally {
      context.currentRepoDeadlineMs = null;
    }

    if (result.repo) {
      repos.push(result.repo);
      scannedRepoCount += 1;
    }

    if (result.note) {
      warnings.push(result.note);
    }

    if (result.skipped) {
      skippedRepoCount += 1;
    }

    if (result.failed) {
      failedRepoCount += 1;
    }

    if (context.timedOut) {
      const remainingCount = repoPaths.length - index - 1;
      skippedRepoCount += remainingCount;

      if (remainingCount > 0) {
        warnings.push(`Scan budget exceeded before ${remainingCount} configured repo${remainingCount === 1 ? "" : "s"} could be scanned.`);
      }

      break;
    }
  }

  repos.sort((left, right) => formatScalar(left.name).localeCompare(formatScalar(right.name), undefined, { sensitivity: "base" }));
  const scanCompletedAt = new Date().toISOString();
  const durationMs = Date.now() - scanStartedAtMs;

  return {
    schemaVersion: GIT_SHEET_SCHEMA_VERSION,
    date: dateStamp,
    generatedAt: scanCompletedAt,
    source: GIT_SHEET_SOURCE,
    summary: summarizeRepos(repos, repoPaths.length),
    scanStartedAt,
    scanCompletedAt,
    durationMs,
    repoCount: repoPaths.length,
    scannedRepoCount,
    skippedRepoCount,
    failedRepoCount,
    timedOut: context.timedOut,
    scanTrigger: normalizeScanTrigger(options.trigger),
    warnings,
    repos,
    notes: warnings,
  };
}

async function scanLocalGitRepo(configuredPath, dateStamp, options) {
  const repoPath = normalizeLocalPath(configuredPath);

  if (!repoPath) {
    return { note: "Skipped an empty repository path.", skipped: true };
  }

  const validationError = validateLocalDirectory(repoPath);
  if (validationError) {
    return { note: `${formatLocalPath(repoPath)}: ${validationError}`, skipped: true };
  }

  const repoValidation = validateTrackedGitRepo(repoPath);
  if (!repoValidation.valid) {
    return { note: repoValidation.message, skipped: true };
  }

  let insideWorkTree;
  try {
    insideWorkTree = await runGit(repoPath, ["rev-parse", "--is-inside-work-tree"], options);
  } catch (error) {
    markScanTimeoutFromError(options, error, repoPath);
    return { note: formatGitFailure(repoPath, error), failed: true };
  }

  if (insideWorkTree.trim() !== "true") {
    return { note: `${formatLocalPath(repoPath)} is not inside a Git work tree.`, failed: true };
  }

  const rootOutput = await tryGit(repoPath, ["rev-parse", "--show-toplevel"], options);
  const repoRoot = normalizeLocalPath(rootOutput || repoPath);
  const hasCommits = Boolean(await tryGit(repoRoot, ["rev-parse", "--verify", "HEAD"], options));
  const branch = await readGitBranch(repoRoot, hasCommits, options);
  const dirty = await readGitDirtyState(repoRoot, options);
  const commitsToday = hasCommits ? await readGitCommitsForDate(repoRoot, dateStamp, options) : [];
  const latestCommit = hasCommits ? await readLatestGitCommit(repoRoot, options) : null;
  const upstream = hasCommits ? await tryGit(repoRoot, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], options) : "";
  const unpushedCommits = upstream ? await readGitCount(repoRoot, ["rev-list", "--count", "@{upstream}..HEAD"], options) : 0;
  const behindUpstream = upstream ? await readGitCount(repoRoot, ["rev-list", "--count", "HEAD..@{upstream}"], options) : 0;

  return {
    repo: {
      name: inferRepoName(repoRoot),
      path: formatLocalPath(repoRoot),
      branch,
      hasCommits,
      touchedToday: commitsToday.length > 0,
      commitsToday: commitsToday.length,
      activityTimestamps: commitsToday.map((commit) => commit.timestamp).filter(Boolean),
      dirty,
      unpushedCommits,
      behindUpstream,
      latestCommit,
      notes: [],
    },
  };
}

async function readGitBranch(repoPath, hasCommits, options) {
  if (!hasCommits) {
    return "";
  }

  const branch = await tryGit(repoPath, ["branch", "--show-current"], options);
  if (branch) {
    return branch.trim();
  }

  const shortHead = await tryGit(repoPath, ["rev-parse", "--short", "HEAD"], options);
  return shortHead ? `detached:${shortenHash(shortHead)}` : "";
}

async function readGitDirtyState(repoPath, options) {
  const status = await tryGit(repoPath, ["status", "--porcelain"], options);
  return Boolean(status && status.trim().length > 0);
}

async function readGitCommitsForDate(repoPath, dateStamp, options) {
  const output = await tryGit(repoPath, [
    "log",
    `--since=${dateStamp}T00:00:00`,
    `--until=${dateStamp}T23:59:59`,
    "--format=%H%x1f%h%x1f%cI%x1f%s",
  ], options);

  return parseGitCommitLines(output);
}

async function readLatestGitCommit(repoPath, options) {
  const output = await tryGit(repoPath, ["log", "-1", "--format=%H%x1f%h%x1f%s"], options);
  const commits = parseGitCommitLines(output);
  return commits.length > 0 ? commits[0] : null;
}

async function readGitCount(repoPath, args, options) {
  const output = await tryGit(repoPath, args, options);
  const count = Number.parseInt(String(output || "").trim(), 10);
  return Number.isFinite(count) ? count : 0;
}

function parseGitCommitLines(output) {
  return String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\x1f");
      const hash = parts[0] || "";
      const shortHash = parts[1] || "";
      const maybeTimestamp = parts[2] || "";
      const hasTimestamp = parts.length >= 4 && isGitIsoTimestamp(maybeTimestamp);
      const messageParts = hasTimestamp ? parts.slice(3) : parts.slice(2);
      const commit = {
        hash: hash || "",
        shortHash: shortHash || "",
        message: messageParts.join(" ").trim(),
      };

      if (hasTimestamp) {
        commit.timestamp = maybeTimestamp;
      }

      return commit;
    });
}

function isGitIsoTimestamp(value) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(formatScalar(value));
}

function summarizeRepos(repos, scannedCount) {
  return {
    reposScanned: scannedCount,
    reposIncluded: repos.length,
    reposTouchedToday: repos.filter((repo) => repo.touchedToday).length,
    commitsToday: repos.reduce((total, repo) => total + toNumber(repo.commitsToday), 0),
    dirtyRepos: repos.filter((repo) => repo.dirty).length,
    unpushedCommits: repos.reduce((total, repo) => total + toNumber(repo.unpushedCommits), 0),
    behindCommits: repos.reduce((total, repo) => total + toNumber(repo.behindUpstream), 0),
  };
}

function runGit(repoPath, args, options = {}) {
  const timeoutMs = getGitCommandTimeoutMs(options);

  if (timeoutMs <= 0) {
    const error = new Error("Scan budget exceeded before Git command could start.");
    error.code = getGlobalRemainingScanBudgetMs(options.context) <= 250 ? "LJ_OS_SCAN_BUDGET_EXCEEDED" : "LJ_OS_REPO_BUDGET_EXCEEDED";
    error.isGitTimeout = true;
    error.gitArgs = args;
    throw error;
  }

  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["-C", repoPath, ...args],
      {
        windowsHide: true,
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          error.gitArgs = args;
          if (error.killed || error.code === "ETIMEDOUT") {
            error.code = error.code || "ETIMEDOUT";
            error.isGitTimeout = true;
          }
          reject(error);
          return;
        }

        resolve(String(stdout || "").trim());
      }
    );
  });
}

async function tryGit(repoPath, args, options = {}) {
  try {
    return await runGit(repoPath, args, options);
  } catch (error) {
    markScanTimeoutFromError(options, error, repoPath);
    return "";
  }
}

function hasScanBudget(context, minimumMs = 250) {
  return getGlobalRemainingScanBudgetMs(context) > minimumMs;
}

function getRemainingScanBudgetMs(context) {
  if (!context || !Number.isFinite(context.deadlineMs)) {
    return DEFAULT_MAX_SCAN_DURATION_SECONDS * 1000;
  }

  const deadlineMs = Number.isFinite(context.currentRepoDeadlineMs)
    ? Math.min(context.deadlineMs, context.currentRepoDeadlineMs)
    : context.deadlineMs;

  return Math.max(0, deadlineMs - Date.now());
}

function getGlobalRemainingScanBudgetMs(context) {
  if (!context || !Number.isFinite(context.deadlineMs)) {
    return DEFAULT_MAX_SCAN_DURATION_SECONDS * 1000;
  }

  return Math.max(0, context.deadlineMs - Date.now());
}

function getPerRepoBudgetMs(context, remainingRepoCount) {
  const remainingMs = getGlobalRemainingScanBudgetMs(context);

  if (remainingRepoCount <= 1) {
    return remainingMs;
  }

  return Math.max(1000, Math.min(10000, Math.floor(remainingMs / remainingRepoCount)));
}

function getGitCommandTimeoutMs(options = {}) {
  const remainingMs = getRemainingScanBudgetMs(options.context);
  const maxCommandMs = normalizeMaxScanDurationSeconds(options.maxDurationSeconds) * 1000;
  return Math.max(0, Math.min(remainingMs, maxCommandMs));
}

function markScanTimeoutFromError(options = {}, error, repoPath) {
  if (!isScanTimeoutError(error) || !options.context) {
    return;
  }

  const repoLabel = repoPath ? ` while scanning ${formatLocalPath(repoPath)}` : "";
  const globalBudgetExceeded = getGlobalRemainingScanBudgetMs(options.context) <= 250 || error.code === "LJ_OS_SCAN_BUDGET_EXCEEDED";
  const warning = globalBudgetExceeded
    ? `Scan budget exceeded${repoLabel}.`
    : `Repo scan budget exceeded${repoLabel}; continuing with remaining repos.`;

  if (globalBudgetExceeded) {
    options.context.timedOut = true;
  }

  if (!options.context.warnings.includes(warning)) {
    options.context.warnings.push(warning);
  }
}

function isScanTimeoutError(error) {
  if (!error) {
    return false;
  }

  return error.isGitTimeout === true || error.code === "ETIMEDOUT" || error.code === "LJ_OS_SCAN_BUDGET_EXCEEDED" || error.code === "LJ_OS_REPO_BUDGET_EXCEEDED";
}

function normalizeScanTrigger(value) {
  return SCAN_TRIGGERS.includes(value) ? value : "manual";
}

function normalizeAutoScanIntervalMinutes(value) {
  const minutes = Math.floor(toNumber(value));
  if (minutes <= 0) {
    return DEFAULT_SETTINGS.autoScanIntervalMinutes;
  }

  return Math.max(minutes, MIN_AUTO_SCAN_INTERVAL_MINUTES);
}

function normalizeMaxScanDurationSeconds(value) {
  const seconds = Math.floor(toNumber(value));
  if (seconds <= 0) {
    return DEFAULT_MAX_SCAN_DURATION_SECONDS;
  }

  return Math.max(seconds, MIN_MAX_SCAN_DURATION_SECONDS);
}

function normalizeScanState(value: unknown): ScanState {
  const state = toRecord(value);

  return {
    isScanRunning: state.isScanRunning === true,
    lastScanStartedAt: formatScalar(state.lastScanStartedAt),
    lastScanCompletedAt: formatScalar(state.lastScanCompletedAt),
    lastSuccessfulScanCompletedAt: formatScalar(state.lastSuccessfulScanCompletedAt),
    lastScanDurationMs: toNumber(state.lastScanDurationMs),
    lastScanTrigger: formatScalar(state.lastScanTrigger),
    lastRepoCount: toNumber(state.lastRepoCount),
    lastScannedRepoCount: toNumber(state.lastScannedRepoCount),
    lastSkippedRepoCount: toNumber(state.lastSkippedRepoCount),
    lastFailedRepoCount: toNumber(state.lastFailedRepoCount),
    lastScanTimedOut: state.lastScanTimedOut === true,
    lastScanStatus: formatScalar(state.lastScanStatus || "not scanned yet"),
  };
}

function getGitSheetMetadata(gitSheet: unknown): GitSheetMetadata {
  const sheet = toRecord(gitSheet);

  return {
    scanCompletedAt: formatScalar(sheet.scanCompletedAt || sheet.generatedAt),
    durationMs: toNumber(sheet.durationMs),
    repoCount: toNumber(sheet.repoCount),
    scannedRepoCount: toNumber(sheet.scannedRepoCount),
    skippedRepoCount: toNumber(sheet.skippedRepoCount),
    failedRepoCount: toNumber(sheet.failedRepoCount),
    timedOut: sheet.timedOut === true,
    scanTrigger: formatScalar(sheet.scanTrigger),
    warnings: Array.isArray(sheet.warnings) ? sheet.warnings : [],
  };
}

function formatCompletedScanStatus(metadata: GitSheetMetadata): string {
  if (metadata.timedOut) {
    return "completed with timeout";
  }

  if (metadata.failedRepoCount > 0 || metadata.warnings.length > 0) {
    return "completed with warnings";
  }

  return "completed";
}

function formatManualScanNotice(gitSheet: unknown, outputPath: string): string {
  const metadata = getGitSheetMetadata(gitSheet);
  const duration = formatDurationMs(metadata.durationMs);

  return [
    `Scanned ${metadata.scannedRepoCount} repos`,
    `skipped ${metadata.skippedRepoCount}`,
    `failed ${metadata.failedRepoCount}`,
    duration,
    outputPath,
  ].join(" · ");
}

function formatScanStateDuration(scanState: ScanState): string {
  const durationMs = toNumber(scanState.lastScanDurationMs);
  return durationMs > 0 ? formatDurationMs(durationMs) : "Not available";
}

function formatDurationMs(value) {
  const durationMs = toNumber(value);

  if (durationMs <= 0) {
    return "0s";
  }

  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  return `${(durationMs / 1000).toFixed(durationMs < 10000 ? 1 : 0)}s`;
}

function formatTimestampForSettings(value) {
  const text = formatScalar(value);
  if (!text) {
    return "Not available";
  }

  return formatGeneratedAt(text);
}

function migrateConfiguredPaths(savedSettings: UnknownRecord): ConfiguredPaths {
  const hasSplitSettings = hasOwn(savedSettings, "scanRoots") || hasOwn(savedSettings, "trackedRepoPaths");

  if (hasSplitSettings) {
    return {
      scanRoots: normalizeRepoPaths(savedSettings.scanRoots),
      trackedRepoPaths: normalizeRepoPaths(savedSettings.trackedRepoPaths),
    };
  }

  const scanRoots: string[] = [];
  const trackedRepoPaths: string[] = [];

  for (const configuredPath of normalizeRepoPaths(savedSettings.repoPaths)) {
    if (hasGitMetadata(configuredPath)) {
      trackedRepoPaths.push(configuredPath);
    } else {
      scanRoots.push(configuredPath);
    }
  }

  return {
    scanRoots: normalizeRepoPaths(scanRoots),
    trackedRepoPaths: normalizeRepoPaths(trackedRepoPaths),
  };
}

function discoverGitRepositories(scanRoots: unknown, options: DiscoveryOptions = {}): DiscoveryResult {
  const roots = normalizeRepoPaths(scanRoots);
  const repositories: string[] = [];
  const warnings: string[] = [];
  const maxDepth = Math.max(0, Math.floor(toNumber(options.maxDepth) || DEFAULT_DISCOVERY_DEPTH));
  const deadlineMs = Date.now() + normalizeMaxScanDurationSeconds(options.maxDurationSeconds) * 1000;
  const skipFolderNames = getDiscoverySkipFolderNames(options.configDir);
  let visitedDirectoryCount = 0;

  for (const root of roots) {
    if (Date.now() >= deadlineMs) {
      warnings.push("Repository discovery stopped because the scan budget was exceeded.");
      break;
    }

    const validationError = validateLocalDirectory(root);
    if (validationError) {
      warnings.push(`${formatLocalPath(root)}: ${validationError}`);
      continue;
    }

    if (hasGitMetadata(root)) {
      repositories.push(root);
      continue;
    }

    const stack = [{ folderPath: root, depth: 0 }];

    while (stack.length > 0) {
      if (Date.now() >= deadlineMs) {
        warnings.push("Repository discovery stopped because the scan budget was exceeded.");
        stack.length = 0;
        break;
      }

      if (visitedDirectoryCount >= DEFAULT_DISCOVERY_MAX_DIRECTORIES) {
        warnings.push(`Repository discovery stopped after ${DEFAULT_DISCOVERY_MAX_DIRECTORIES} folders.`);
        stack.length = 0;
        break;
      }

      const current = stack.pop();
      if (!current) {
        continue;
      }
      visitedDirectoryCount += 1;

      if (hasGitMetadata(current.folderPath)) {
        repositories.push(current.folderPath);
        continue;
      }

      if (current.depth >= maxDepth) {
        continue;
      }

      let entries;
      try {
        entries = fs.readdirSync(current.folderPath, { withFileTypes: true });
      } catch {
        warnings.push(`${formatLocalPath(current.folderPath)} could not be searched.`);
        continue;
      }

      for (const entry of entries) {
        if (!entry.isDirectory() || entry.isSymbolicLink() || shouldSkipDiscoveryFolder(entry.name, skipFolderNames)) {
          continue;
        }

        stack.push({
          folderPath: path.join(current.folderPath, entry.name),
          depth: current.depth + 1,
        });
      }
    }
  }

  return {
    repositories: normalizeRepoPaths(repositories),
    warnings,
  };
}

function getDiscoverySkipFolderNames(configDir: unknown): Set<string> {
  const skipFolderNames = new Set(DISCOVERY_SKIP_FOLDER_NAMES);
  const configDirName = getConfigDirFolderName(configDir);

  if (configDirName) {
    skipFolderNames.add(configDirName);
  }

  return skipFolderNames;
}

function getConfigDirFolderName(configDir: unknown): string {
  const normalizedConfigDir = normalizeFolderPath(configDir).toLowerCase();
  const parts = normalizedConfigDir.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : "";
}

function validateTrackedGitRepo(repoPath) {
  if (hasGitMetadata(repoPath)) {
    return { valid: true };
  }

  return {
    valid: false,
    message: formatNotGitRepositoryMessage(repoPath),
  };
}

function hasGitMetadata(repoPath) {
  try {
    const stats = fs.statSync(path.join(repoPath, ".git"));
    return stats.isDirectory() || stats.isFile();
  } catch {
    return false;
  }
}

function shouldSkipDiscoveryFolder(name: unknown, skipFolderNames: Set<string> = DISCOVERY_SKIP_FOLDER_NAMES): boolean {
  const normalizedName = String(name || "").trim().toLowerCase();

  if (!normalizedName) {
    return true;
  }

  if (normalizedName.startsWith(".") && normalizedName !== ".git") {
    return true;
  }

  return skipFolderNames.has(normalizedName);
}

function mergeUniquePaths(existingPaths, newPaths) {
  return normalizeRepoPaths([...normalizeRepoPaths(existingPaths), ...normalizeRepoPaths(newPaths)]);
}

function formatNotGitRepositoryMessage(repoPath) {
  const formattedPath = formatLocalPath(repoPath);

  if (isDriveRoot(repoPath)) {
    return `${formattedPath} is a scan root, not a Git repo. Run Discover repositories to find repos inside it.`;
  }

  return `${formattedPath} is not a Git repository. Use Discover repositories if this is a parent folder.`;
}

function isDriveRoot(repoPath) {
  const normalizedPath = normalizeLocalPath(repoPath);
  const rootPath = normalizeLocalPath(path.parse(normalizedPath).root);
  return normalizedPath === rootPath;
}

function normalizeRepoPaths(value: unknown): string[] {
  const rawPaths = Array.isArray(value) ? value : String(value || "").split(/\r?\n/);
  const seen = new Set<string>();
  const repoPaths: string[] = [];

  for (const rawPath of rawPaths) {
    const repoPath = normalizeLocalPath(rawPath);
    if (!repoPath) {
      continue;
    }

    const key = process.platform === "win32" ? repoPath.toLowerCase() : repoPath;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    repoPaths.push(repoPath);
  }

  return repoPaths;
}

function normalizeLocalPath(value: unknown): string {
  let text = String(value || "").trim();
  if (!text) {
    return "";
  }

  text = text.replace(/^["']|["']$/g, "").trim();

  try {
    return path.resolve(text);
  } catch {
    return text;
  }
}

function validateLocalDirectory(repoPath: string): string {
  try {
    const stats = fs.statSync(repoPath);
    return stats.isDirectory() ? "" : "Path is not a folder.";
  } catch {
    return "Path does not exist or cannot be read.";
  }
}

function formatRepoPathsForSettings(value: unknown): string {
  return normalizeRepoPaths(value).join("\n");
}

function formatGitFailure(repoPath: string, error: unknown): string {
  return `Could not scan ${formatLocalPath(repoPath)}: ${formatGitError(error)}`;
}

function formatGitError(error: unknown): string {
  const gitError = toRecord(error);

  if (gitError.code === "ENOENT") {
    return "Git is not available to Obsidian. Install Git or make sure Git is in PATH.";
  }

  const stderr = String(gitError.stderr || "").trim();
  if (stderr) {
    if (/not a git repository/i.test(stderr)) {
      return "This path is not a Git repository. Use Discover repositories if it is a parent folder.";
    }

    return stderr.split(/\r?\n/)[0].trim();
  }

  const message = String(gitError.message || "").trim();
  if (/not a git repository/i.test(message)) {
    return "This path is not a Git repository. Use Discover repositories if it is a parent folder.";
  }

  return message || "Git command failed.";
}

function inferRepoName(repoPath: string): string {
  return path.basename(repoPath) || formatLocalPath(repoPath);
}

function formatLocalPath(value: unknown): string {
  return String(value || "").replace(/\\/g, "/");
}

function joinVaultPath(...parts: unknown[]): string {
  return normalizePath(parts.map((part) => String(part || "").trim()).filter(Boolean).join("/"));
}

function hasOwn(object: unknown, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function getFolderPart(vaultPath: string): string {
  const index = vaultPath.lastIndexOf("/");
  return index === -1 ? "" : vaultPath.slice(0, index);
}

function sanitizeFolderSetting(value: unknown, fallback: string): string {
  const normalized = normalizeFolderPath(value);
  return normalized || fallback;
}

function normalizeFolderPath(value: unknown): string {
  return normalizePath(String(value || "").trim().replace(/^\/+|\/+$/g, ""));
}

function normalizeRenderSettings(settingsOrHeading) {
  if (typeof settingsOrHeading === "string") {
    return Object.assign({}, DEFAULT_SETTINGS, { dailySectionHeading: settingsOrHeading });
  }

  return Object.assign({}, DEFAULT_SETTINGS, settingsOrHeading || {});
}

function getRecentLocalDateInfos(dayCount = 7, endDate = new Date()) {
  const count = Math.max(1, Math.floor(toNumber(dayCount)) || 7);
  const end = endDate instanceof Date && Number.isFinite(endDate.getTime()) ? endDate : new Date();
  const todayStamp = formatLocalDateStamp(new Date());
  const dates = [];

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(end.getFullYear(), end.getMonth(), end.getDate() - offset, 12, 0, 0, 0);
    const dateStamp = formatLocalDateStamp(date);
    dates.push({
      date,
      dateStamp,
      label: dateStamp === todayStamp ? "Today" : formatShortWeekday(date),
    });
  }

  return dates;
}

function formatLocalDateStamp(date) {
  const value = date instanceof Date && Number.isFinite(date.getTime()) ? date : new Date();
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseLocalDateStamp(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(formatScalar(value));
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day, 12, 0, 0, 0);

  return Number.isFinite(date.getTime()) ? date : null;
}

function formatShortWeekday(date) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()] || "";
}

function normalizeTableFormat(value) {
  return ["compact", "standard", "detailed", "emoji-board"].includes(value) ? value : DEFAULT_SETTINGS.tableFormat;
}

function normalizeSummaryStyle(value) {
  return ["callout", "scoreboard", "pit-wall"].includes(value) ? value : DEFAULT_SETTINGS.summaryStyle;
}

function normalizeRepoView(value) {
  return ["table", "status-cards"].includes(value) ? value : DEFAULT_SETTINGS.repoView;
}

function normalizeTidyView(value) {
  return ["queue", "shutdown-checklist"].includes(value) ? value : DEFAULT_SETTINGS.tidyView;
}

function sanitizeTextSetting(value, fallback) {
  const text = formatScalar(value);
  return text || fallback;
}

function sanitizeCoordinateSetting(value) {
  return formatScalar(value).trim();
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

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toOptionalNumber(value) {
  if (value === null || typeof value === "undefined" || (typeof value === "string" && value.trim() === "")) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatRepoTableHeader(useEmoji, tableFormat) {
  if (tableFormat === "emoji-board") {
    return useEmoji
      ? "| 🧰 Repo | 🌿 Branch | 🏁 Activity | 🧼 Tidy | 🚀 Push | 📥 Pull |"
      : "| Repo | Branch | Activity | Tidy | Push | Pull |";
  }

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
  if (tableFormat === "emoji-board") {
    return "| --- | --- | :---: | :---: | :---: | :---: |";
  }

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

  if (tableFormat === "emoji-board") {
    return toMarkdownTableRow([
      "No repos included",
      "",
      formatActivityCell(0, useEmoji),
      formatBoardTidyCell(false, useEmoji),
      formatBoardPushCell(0, useEmoji),
      formatBoardPullCell(0, useEmoji),
    ]);
  }

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

  if (tableFormat === "emoji-board") {
    return toMarkdownTableRow([
      repo.name || "Unnamed repo",
      repo.branch || "",
      formatActivityCell(repo.commitsToday, useEmoji),
      formatBoardTidyCell(repo.dirty, useEmoji),
      formatBoardPushCell(repo.unpushedCommits, useEmoji),
      formatBoardPullCell(repo.behindUpstream, useEmoji),
    ]);
  }

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

function isRepoClear(repo) {
  return !repo.dirty && toNumber(repo.unpushedCommits) === 0 && toNumber(repo.behindUpstream) === 0;
}

function formatRepoTitle(repo) {
  const name = formatScalar(repo.name || "Unnamed repo");
  const branch = repo.branch ? ` \`${formatInlineCode(repo.branch)}\`` : "";
  return `${name}${branch}`;
}

function formatCommitCount(value) {
  const count = toNumber(value);
  return `${count} ${count === 1 ? "commit" : "commits"}`;
}

function formatUnpushedStatus(value, useEmoji) {
  const count = toNumber(value);
  return maybeEmoji("🚀", `${count} unpushed`, useEmoji);
}

function formatBehindStatus(value, useEmoji) {
  const count = toNumber(value);
  return maybeEmoji("📥", `${count} behind`, useEmoji);
}

function formatActivityCell(value, useEmoji) {
  const count = toNumber(value);

  if (!useEmoji) {
    return String(count);
  }

  if (count <= 0) {
    return "—";
  }

  if (count === 1) {
    return "🏁";
  }

  if (count <= 4) {
    return "🏁🏁";
  }

  return "🏁🏁🏁";
}

function formatBoardTidyCell(value, useEmoji) {
  if (!useEmoji) {
    return value ? "Tidy" : "Clean";
  }

  return value ? "🧹" : "✅";
}

function formatBoardPushCell(value, useEmoji) {
  const count = toNumber(value);

  if (!useEmoji) {
    return String(count);
  }

  return count > 0 ? `🚀 ${count}` : "✅";
}

function formatBoardPullCell(value, useEmoji) {
  const count = toNumber(value);

  if (!useEmoji) {
    return String(count);
  }

  return count > 0 ? `📥 ${count}` : "✅";
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
