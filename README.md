# LJ OS Git Wall

LJ OS Git Wall is a standalone Obsidian desktop plugin for people who work
across local Git repositories and want a quick daily picture of what changed.
It discovers local repos from folders or drives you choose, quietly scans the
repos you track, writes a small JSON snapshot inside your vault, and renders a
Git Wall in your Daily Note from that cached data.

No login. No API keys. No cloud service. No companion repo. No companion app.
No required CLI. No analytics. LJ OS reads local Git metadata only and stores
generated activity data locally.

```text
Scan roots -> Discover repositories -> Tracked repos -> Cached JSON -> Git Wall
```

## What It Does

- helps you find local Git repos from user-configured scan roots
- tracks one or more validated Git repositories
- scans tracked repos on startup and on an interval while Obsidian is open
- can refresh stale LJ OS views in the background without blocking rendering
- writes daily JSON snapshots to `LJ OS/stats/YYYY-MM-DD.json` by default
- inserts or replaces a Daily Note Git Wall from cached JSON only
- lets you reorder the main generated sections in **Dashboard Layout**
- keeps manual scanning available as an explicit fallback

## What It Does Not Do

- does not require a second repository, external app, server, login, or API key
- does not call GitHub or any remote API
- does not send analytics, telemetry, repo names, commits, or paths anywhere
- does not auto-crawl every drive
- does not rediscover repos during startup, interval, or view-open scans
- does not run Git commands while inserting the Git Wall into a note
- does not support mobile, because local filesystem and Git access are desktop
  Obsidian capabilities

If Obsidian Sync, Git sync, iCloud, Dropbox, OneDrive, or another tool syncs
your vault, that is outside LJ OS. LJ OS itself does not send data anywhere.

## Install From A Release

Download the individual release assets from this repository:

```text
main.js
manifest.json
```

If a release includes `styles.css`, download that file too. This repository
does not currently require a stylesheet.

Copy the files into your vault:

```text
<vault>/.obsidian/plugins/lj-os/
```

Then reload Obsidian plugins and enable **LJ OS** in Community plugins. There
is no build step, `npm install`, login, API setup, companion app, or companion
CLI required for normal use.

## First-Time Setup

1. Install and enable the plugin.
2. Open **Settings -> Community plugins -> LJ OS**.
3. Use the **Git Started** setup card.
4. Add one or more **Scan roots** or exact repo paths.
5. Click **Discover repositories**.
6. Review **Tracked repositories**.
7. Click **Scan now** once to create today's cached JSON.
8. Confirm startup and interval automation are enabled.
9. Run **LJ OS: Insert Today's Git Wall** to add the section to today's note.

Fastest setup: add your main repo folder or drive, click **Discover
repositories**, then click **Scan now**.

After repos exist, the setup card changes to **Setup Complete ☑️**. Normal use
is automatic: LJ OS scans quietly in the background and Daily Note insertion
renders cached data immediately.

## Scan Roots vs Tracked Repositories

This distinction matters.

**Scan roots** are folders or drives LJ OS searches when you click **Discover
repositories**.

```text
G:\
C:\Repos
D:\Client Work
```

**Tracked repositories** are validated Git repos LJ OS actually scans.

```text
G:\obsidian-lj-os-plugin
G:\CannabisMath
G:\moby-core
```

Use drive roots like `G:\` under **Scan roots**, not **Tracked repositories**.
`G:\` is not scanned as a repo unless `G:\.git` exists. Broad drive roots can
take longer to discover; a specific repo parent folder such as `G:\Code` is
usually faster.

Discovery is manual. Startup, interval, view-open, and manual scans use tracked
repositories only. They do not crawl scan roots, walk every drive, or rediscover
repositories.

## Scanning And Caching

Auto-scan is enabled by default:

- **Scan on startup** runs quietly after Obsidian finishes loading.
- **Auto-scan while Obsidian is open** runs quiet interval scans every 60
  minutes by default.
- **Refresh in background when LJ OS view opens** shows cached data first, then
  refreshes stale scan data quietly for the future.

Manual scans can take several seconds depending on repo count, repo size, disk
speed, and Git availability. The manual command is explicit:

```text
LJ OS: Scan Configured Git Repositories
```

The Git Wall / Daily Note insert command does not scan. It reads today's cached
JSON if present and renders immediately. If today's JSON is missing, it inserts
a short fallback message telling you to run a scan or enable automation.

LJ OS has a scan duration budget, defaulting to 30 seconds. Slow or bad repos
are skipped or recorded as warnings where possible so one repo does not poison
future scans.

## Local Storage

Default generated data folder:

```text
LJ OS/stats
```

Default daily JSON path:

```text
LJ OS/stats/YYYY-MM-DD.json
```

Default Daily Note folder:

```text
Daily Notes
```

The JSON stays in your vault. Plugin settings are stored through Obsidian's
normal plugin data storage.

## Commands

| Command | Purpose |
| --- | --- |
| **LJ OS: Insert Today's Git Wall** | Insert or replace the Daily Note section from today's cached JSON. Does not scan. |
| **LJ OS: Scan Configured Git Repositories** | Explicit fallback scan of enabled tracked repos. |
| **LJ OS: Discover Repositories** | Search scan roots and add valid child repos to tracked repositories. |

## Settings

| Setting | Default | What it controls |
| --- | --- | --- |
| Git Wall data folder | `LJ OS/stats` | Vault folder where generated activity JSON is stored. |
| Scan roots | empty | Folders or drives searched only when you click **Discover repositories**. |
| Tracked repositories | empty | Validated Git repos LJ OS scans automatically. |
| Daily note folder | `Daily Notes` | Where dated notes are created or updated. |
| Scan status | runtime | Compact status, duration, last scan, trigger, tracked repos, failed, and skipped counts. |
| Scan on startup | On | Quiet scan after Obsidian finishes loading. |
| Auto-scan while Obsidian is open | On | Quiet interval scans of enabled tracked repos. |
| Scan interval in minutes | `60` | Interval and view-open freshness threshold, minimum `15`. Hidden when auto-scan is off. |
| Refresh in background when LJ OS view opens | On | Shows cached data immediately, then refreshes stale data quietly in the background. |
| Dashboard Layout | default order | Reorder generated Git Wall sections with **Move up**, **Move down**, and **Reset layout**. |
| Use emoji | On | Emoji-forward or plain rendered output. |
| Show summary section | On | Shows or hides the summary output. |
| Summary style | `callout` | `callout`, `scoreboard`, or `pit-wall`. |
| Show repository section | On | Shows or hides repository output. |
| Repo view | `table` | `table` or `status-cards`. |
| Table format | `standard` | `compact`, `standard`, `detailed`, or `emoji-board`. |
| Show tidy-up section | On | Shows or hides tidy-up output. |
| Tidy view | `queue` | `queue` or `shutdown-checklist`. |
| Show customized label settings | Off | Shows title and section-name fields. |
| Daily section heading | `## 🧱 Git Wall` | Replacement marker for the Git Wall block. |
| Summary title | `🏁 Git Wall` | Summary callout title. |
| Repository section title | `🧰 Repo Garage` | Repository section heading. |
| Tidy-up section title | `🧹 Tidy-Up Queue` | Tidy-up section heading. |
| Reset labels | action | Restores default Git Wall headings and titles. |
| Show advanced scanning settings | Off | Reveals optional scan budget and discovery details. |
| Max scan duration seconds | `30` | Advanced scan budget before LJ OS records warnings and saves partial data when possible. |

Changing the Daily section heading changes the replacement marker. If you
change it after inserting a Git Wall, delete or rename the old heading once.

## Dashboard Layout

**Dashboard Layout** controls the order of the main generated sections:

1. Git Scoreboard
2. Repository Activity
3. Cleanup Checklist

Use **Move up** and **Move down** to change the output order. Use **Reset
layout** to restore the default order. This affects generated Git Wall / Daily
Note output only; it does not affect discovery, scanning, cached JSON storage,
or section content.

## Example Output

```markdown
## 🧱 Git Wall

Generated: May 13, 2026, 9:00 PM PDT
Last scan: May 13, 2026, 9:00 PM PDT
Scan details: duration 2.5s · trigger interval

> [!summary] 🏁 Git Wall
> 🧭 Scanned: **3** repos
> 🛠️ Touched: **2** repos
> 🏁 Commits: **5**
> 🧼 Tidy up: **1** repos
> 🚀 Unpushed: **2**
> 📥 Behind remote: **0**

### 🧰 Repo Garage

| Repo | 🌿 Branch | 🏁 Commits | 🧼 Status | 🚀 Unpushed | 📥 Behind | Latest |
| --- | --- | ---: | :---: | ---: | ---: | --- |
| obsidian-lj-os-plugin | main | 2 | ✅ Clean | 0 | 0 | a1b2c3d - Standalone scanner |
| cannabis-coa-parser | main | 3 | 🧹 Tidy | 2 | 0 | d4e5f6a - Parse notes |

### 🧹 Tidy-Up Queue

- 🧹 cannabis-coa-parser `main`
```

## Generated JSON

LJ OS writes a compact local JSON snapshot each day. It is plain JSON so you
can inspect it or back it up with your vault.

```json
{
  "schemaVersion": "0.3.0",
  "date": "2026-05-13",
  "generatedAt": "2026-05-13T21:00:00.000Z",
  "source": "obsidian-lj-os-plugin",
  "machine": "local-workstation",
  "summary": {
    "reposScanned": 3,
    "reposIncluded": 3,
    "reposTouchedToday": 2,
    "commitsToday": 5,
    "dirtyRepos": 1,
    "unpushedCommits": 2,
    "behindCommits": 0
  },
  "scanStartedAt": "2026-05-13T21:00:00.000Z",
  "scanCompletedAt": "2026-05-13T21:00:02.500Z",
  "durationMs": 2500,
  "repoCount": 3,
  "scannedRepoCount": 3,
  "skippedRepoCount": 0,
  "failedRepoCount": 0,
  "timedOut": false,
  "scanTrigger": "interval",
  "warnings": [],
  "repos": [
    {
      "name": "obsidian-lj-os-plugin",
      "path": "G:/obsidian-lj-os-plugin",
      "branch": "main",
      "hasCommits": true,
      "touchedToday": true,
      "commitsToday": 2,
      "dirty": false,
      "unpushedCommits": 0,
      "behindUpstream": 0,
      "latestCommit": {
        "hash": "a1b2c3d4e5f6",
        "shortHash": "a1b2c3d",
        "message": "Standalone scanner"
      },
      "notes": []
    }
  ],
  "notes": []
}
```

## Render Views

Summary styles:

- **Callout**: Obsidian summary callout.
- **Scoreboard**: stat table with one metric per row.
- **Pit Wall**: interpreted status table for activity, cleanup, push, and sync.

Repository views:

- **Table**: uses the selected table format.
- **Status Cards**: one Obsidian callout per repo, using success/warning state.

Table formats:

- **Compact**: repo, branch, status, commits.
- **Standard**: repo, branch, commits, status, unpushed, behind, latest.
- **Detailed**: standard plus repo path.
- **Emoji Board**: compact visual board for activity, tidy, push, and pull.

Tidy views:

- **Queue**: simple list of repos needing tidy-up.
- **Shutdown Checklist**: checkbox list for tidy-up, push review, and sync
  review.

All views render from the same vault-local JSON generated by this plugin.

## Privacy And Local-First Behavior

LJ OS itself:

- requires no login
- requires no API keys
- uses no APIs or remote services
- uses no cloud service
- sends no analytics or telemetry
- is not spyware
- has no companion repo
- has no companion app
- has no required CLI for normal plugin use
- performs no remote syncing
- reads local Git metadata from repositories you configure
- writes generated JSON inside your vault, defaulting to `LJ OS/stats`

Git may contact remotes only when you use Git outside LJ OS. LJ OS scans local
metadata and local command output; it does not call remote Git hosting APIs.

## Desktop-Only

LJ OS is marked desktop-only in `manifest.json`. Local filesystem and Git access
are not mobile-friendly Obsidian plugin capabilities, so mobile support is not
applicable unless the architecture changes in the future.

## Troubleshooting

See [Troubleshooting](docs/troubleshooting.md) for common fixes, including:

- drive roots such as `G:\` being added to the wrong setting
- no repos discovered
- Git not available in PATH
- no Git Wall data yet
- stale Daily Note output
- auto-scan not updating
- release asset mismatch

## Release And Obsidian Submission Checklist

Before creating a GitHub release or submitting to Obsidian community plugins:

- `manifest.json` has the intended plugin version.
- `package.json` matches `manifest.json` if `package.json` has a `version`.
- `versions.json` contains the same plugin version key.
- The GitHub release tag and release name exactly match `manifest.json`
  `version`.
- Do not use a `v` prefix for the release tag or name. Use `0.7.3`, not
  `v0.7.3`, when the manifest version is `0.7.3`.
- Release assets are individual files: `main.js`, `manifest.json`, and
  `styles.css` if present.
- Do not upload only a zip file for Obsidian release assets.
- `README.md` exists at the repository root and explains purpose and usage.
- `LICENSE` exists before community submission.
- The plugin id in `manifest.json` matches the id submitted to
  `obsidian-releases` `community-plugins.json`.
- `isDesktopOnly` is accurate and desktop-only behavior is documented.
- `node --check .\main.js` passes before release.
- A manual Obsidian install smoke test passes using only the release assets.

Known current release-prep gap from this docs audit: this workspace did not
show a `LICENSE` file. Add one before community plugin submission.

## More Docs

- [FAQ](docs/faq.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Views](docs/views.md)
