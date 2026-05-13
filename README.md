# LJ OS Git Wall

LJ OS Git Wall is a standalone Obsidian desktop plugin that quietly scans the
local Git repositories you track and renders a daily activity snapshot into a
Daily Note.

No companion repo. No companion CLI. No login. No API keys. No GitHub API. No
telemetry. No cloud calls. No spyware. The plugin stays local-first and stores
its generated activity JSON inside your vault.

```text
Tracked local repos -> quiet auto-scan -> vault JSON -> Daily Note Git Wall
```

## What It Does

- discovers repositories from scan roots only when you ask it to
- scans only enabled tracked repository paths
- auto-scans on startup, on an interval, and when stale LJ OS notes open
- reads local Git metadata and local Git command output when available
- saves daily activity data to a vault-local JSON file
- inserts or replaces a Git Wall section from cached local JSON
- supports multiple summary, repository, and tidy-up views
- keeps manual scanning as a fallback, not the normal workflow
- avoids broad drive crawling and interval rediscovery
- works without npm install, a server, a separate package, or a second repo

This plugin is desktop-first because local filesystem and Git access are desktop
Obsidian capabilities.

## Install From A Release

Download these release assets from this repository:

```text
main.js
manifest.json
```

If a future release includes `styles.css`, download that too.

Copy the files into your vault:

```text
<vault>/.obsidian/plugins/lj-os/
```

Then reload Obsidian plugins and enable **LJ OS** in Community plugins.

There is no build step, npm install, login, API setup, or companion CLI required
for normal use.

## Setup

1. Open **Settings -> Community plugins -> LJ OS**.
2. Use the **Get started** setup panel.
3. Add one or more scan roots, one per line. A scan root can be a folder or
   drive such as `G:\`.
4. Click **Discover repositories** to find repos under those scan roots.
5. Review **Tracked repositories**.
6. Click **Scan now** to create today's cached JSON.
7. Run **LJ OS: Insert Today's Git Wall** once when you want the section added
   to today's note. Insert reads cached JSON only and does not wait for Git.

Fastest setup: add your main repo folder or drive, click **Discover
repositories**, then click **Scan now**.

Auto-scan is enabled by default. LJ OS scans on startup, then every 60 minutes
while Obsidian is open. It also checks stale data when today's LJ OS note or an
existing LJ OS section opens.

You can also run **LJ OS: Scan Configured Git Repositories** to update the local
JSON without inserting the Daily Note section. That command is optional and is
mainly useful as a fallback.

## Discovery And Auto-Scan

Discovery is manual: you decide which folders or drives LJ OS should search by
adding them as scan roots. A scan root such as `G:\` is not scanned as a repo
unless `G:\.git` exists. Click **Discover repositories** to search up to 3
folders deep for child repos like `G:\obsidian-lj-os-plugin\.git` and add them
to tracked repositories.

Tracked repositories are the exact repos LJ OS scans automatically. Remove a
tracked repo path to disable it. Auto-scan never crawls scan roots, walks all
drives, or rediscover repos on each interval.

Auto-scan only scans those enabled tracked repos. Its default target is 30
seconds. If a repo is slow or unavailable, LJ OS records a warning, saves useful
partial data when possible, and future scans can still run.

Git Wall insertion never scans. It renders the most recent cached JSON for
today, including last scan time, duration, trigger, and warning/timeout status
when present.

Advanced scanning settings are optional and collapsed by default. Most users
only need scan roots, tracked repositories, automation toggles, and Scan now.

## Local Storage

Default generated data folder:

```text
LJ OS/stats
```

Default generated JSON path:

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
| **LJ OS: Scan Configured Git Repositories** | Fallback/manual scan of enabled tracked repos without editing a note. |
| **LJ OS: Discover Repositories** | Search scan roots and add discovered Git repos to tracked repositories. |

## Settings

| Setting | Default | What it controls |
| --- | --- | --- |
| Git Wall data folder | `LJ OS/stats` | Vault folder where generated activity JSON is stored. |
| Scan roots | empty | Folders or drives to search manually, such as `G:\`. |
| Tracked repositories | empty | Exact valid Git repos LJ OS scans automatically. |
| Daily note folder | `Daily Notes` | Where dated notes are created or updated. |
| Scan status | runtime | Compact summary of status, duration, last scan, trigger, tracked repos, failed, and skipped. |
| Scan on startup | On | Quietly scan after Obsidian finishes loading. |
| Auto-scan while Obsidian is open | On | Quiet interval scans of enabled tracked repos. |
| Scan interval in minutes | `60` | Interval and view-open freshness threshold, minimum `15`. |
| Refresh in background when LJ OS view opens | On | Shows cached data immediately, then refreshes scan data quietly in the background. |
| Use emoji | On | Emoji-forward or plain rendered output. |
| Show summary section | On | Shows or hides summary output. |
| Summary style | `callout` | `callout`, `scoreboard`, or `pit-wall`. |
| Show repository section | On | Shows or hides repo output. |
| Repo view | `table` | `table` or `status-cards`. |
| Table format | `standard` | `compact`, `standard`, `detailed`, or `emoji-board`. |
| Show tidy-up section | On | Shows or hides tidy-up output. |
| Tidy view | `queue` | `queue` or `shutdown-checklist`. |
| Show customized label settings | Off | Shows title and section-name fields. |
| Daily section heading | `## 🧱 Git Wall` | Replacement marker for the Git Wall block. |
| Summary title | `🏁 Git Wall` | Summary callout title. |
| Repository section title | `🧰 Repo Garage` | Repo section heading. |
| Tidy-up section title | `🧹 Tidy-Up Queue` | Queue section heading. |
| Show advanced scanning settings | Off | Reveals optional scan limits and discovery details. |
| Max scan duration seconds | `30` | Advanced scan budget before LJ OS saves partial data and warnings. |

Changing the Daily section heading changes the replacement marker. If you change
it after inserting a Git Wall, delete or rename the old heading once.

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

LJ OS writes a compact local JSON snapshot each day. It is an implementation
detail, but it is plain JSON so you can inspect or back it up with your vault.

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
      "path": "C:/Repos/obsidian-lj-os-plugin",
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

Repo views:

- **Table**: uses the selected table format.
- **Status Cards**: one Obsidian callout per repo, using success/warning state.

Table formats:

- **Compact**: repo, branch, status, commits.
- **Standard**: repo, branch, commits, status, unpushed, behind, latest.
- **Detailed**: standard plus repo path.
- **Emoji Board**: compact visual board for activity, tidy, push, and pull.

Tidy views:

- **Queue**: simple list of repos needing tidy-up.
- **Shutdown Checklist**: checkbox list for tidy-up, push review, and sync review.

All views render from the same vault-local JSON generated by this plugin.

## Privacy

LJ OS stays local:

- no login
- no API keys
- no remote services
- no GitHub API
- no telemetry
- no cloud calls
- no file crawling outside configured repo paths
- no automatic drive-wide discovery
- local Git metadata only
- generated activity data stored locally in your vault

## Troubleshooting

**Nothing inserted into my Daily Note**

Add at least one scan root in plugin settings, click **Discover repositories**,
then run **LJ OS: Insert Today's Git Wall** once to create or update the note
section.

Insert is cached-data-only. If today's JSON does not exist yet, it inserts a
short fallback message instead of running Git.

**A repo is listed under Scan Notes**

Check that the configured path exists and points inside a Git work tree. If Git
is not available to Obsidian, install Git or make sure it is available on PATH.

**G:\ says it is a scan root**

Expected. `G:\` is a parent folder or drive root, not a repo unless `G:\.git`
exists. Add it under **Scan roots**, click **Discover repositories**, and LJ OS
will add valid child repos to **Tracked repositories**.

**Auto-scan seems quiet**

Expected. Startup, interval, and view-open scans do not show success notices.
Check the settings status fields or `LJ OS/stats/YYYY-MM-DD.json`.

**A scan timed out**

The default budget is 30 seconds. LJ OS saves partial data and warnings when it
can. Increase **Max scan duration seconds** if your tracked repos need more
time.

**Wrong Daily Note folder**

Update the **Daily note folder** setting.

**Wrong data folder**

Update the **Git Wall data folder** setting. The plugin writes generated JSON
there before rendering.

**My old heading still appears**

The Daily section heading setting is used to find and replace the block. If you
change the heading, delete the old Git Wall section once.

## Release Checklist

Version files for the current release:

- `manifest.json`: `0.7.3`
- `versions.json`: `0.7.3`
- `package.json`: `0.7.3`

Required release assets:

```text
main.js
manifest.json
```

Include `styles.css` only if the release contains one. This repo currently does
not require a stylesheet.

## More Docs

- [FAQ](docs/faq.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Views](docs/views.md)
