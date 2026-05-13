# Troubleshooting

## Nothing is inserted

Run **LJ OS: Insert Today's Git Wall** or use the settings setup flow. The
fastest path is:

1. Open **Settings -> Community plugins -> LJ OS**.
2. Use the **Git Started** card.
3. Add a **Scan root** or exact repo path.
4. Click **Discover repositories**.
5. Review **Tracked repositories**.
6. Click **Scan now**.
7. Insert the Git Wall.

Insert uses cached JSON only. It does not run Git or wait for a scan. If
today's JSON is missing, it inserts a fallback message instead of blocking.

## No Git Wall data found for today

Today's JSON does not exist yet. Click **Scan now**, run **LJ OS: Scan
Configured Git Repositories**, or enable startup/interval scanning and wait for
the background scan to complete.

Default JSON location:

```text
LJ OS/stats/YYYY-MM-DD.json
```

## G:\ is not a Git repository

That is expected for a drive root. Add `G:\` under **Scan roots**, not
**Tracked repositories**. Then click **Discover repositories** so LJ OS can add
child repos such as `G:\obsidian-lj-os-plugin` to **Tracked repositories**.

`G:\` itself is scanned only if `G:\.git` exists.

## No repos were discovered

Try these checks:

- Make sure the scan root exists and Obsidian can read it.
- Use a more specific parent folder such as `G:\Code` instead of an entire
  drive when possible.
- Confirm the repos contain `.git` metadata.
- Check that the repos are within the discovery depth.
- Avoid expecting discovery to search skipped noisy folders such as
  `node_modules`, `.obsidian`, `.git`, `AppData`, `Windows`, `Program Files`,
  `$Recycle.Bin`, or `System Volume Information`.

Discovery is manual. Startup, interval, view-open, and manual scans do not
discover repositories.

## No tracked repos found yet

Manual, startup, interval, and view-open scans only scan **Tracked
repositories**. If you have **Scan roots** but no tracked repos, click
**Discover repositories** first.

## A repo appears under Scan Notes

Check that the tracked path exists and points to a Git work tree. LJ OS
validates repo paths before scanning and records warnings instead of treating
parent folders as repos.

If the note says Git is not available, install Git or make sure Git is available
to Obsidian on PATH.

## Git is not available in PATH

Install Git for your operating system, then restart Obsidian so the desktop app
sees the updated PATH. LJ OS has no required companion CLI, but it uses local
Git commands when available to read repository metadata.

## Auto-scan is not updating

Check these settings:

- **Tracked repositories** contains valid repo paths.
- **Scan on startup** is enabled if you want a startup scan.
- **Auto-scan while Obsidian is open** is enabled if you want interval scans.
- **Scan interval in minutes** is at least `15`.
- **Refresh in background when LJ OS view opens** is enabled if you want stale
  views to refresh quietly.

Automatic scans do not show success notices. Check **Scan status** in settings
or inspect `LJ OS/stats/YYYY-MM-DD.json`.

## Daily note output is stale

Git Wall insertion renders cached JSON only. Run **Scan now** or wait for a
startup, interval, or background view-open scan to refresh today's JSON, then
insert or replace the Git Wall again.

## Insert is slow

It should be near-instant because insert reads cached JSON and writes Markdown
only. If it feels slow, check whether a manual scan was run separately. The
insert command does not call Git.

## Scan takes too long

Manual scans can take several seconds with many repos. The default scan target
is 30 seconds. LJ OS records warnings, saves useful partial data when possible,
and future scans can still run.

Use **Advanced Scanning Settings** only if needed:

- increase **Max scan duration seconds** for large repo sets
- remove slow or unavailable repos from **Tracked repositories**
- use narrower scan roots during discovery

## A manual scan says another scan is running

LJ OS prevents overlapping scans. Wait for the current startup, interval,
view-open, or manual scan to finish, then run the command again if needed.

## Auto-scan is scanning the wrong thing

Auto-scan only reads enabled tracked repo paths. It does not scan raw scan roots
such as `G:\`, crawl all drives, rediscover repositories, scan hidden/system
folders, or search broad folder trees on an interval.

## Wrong folder

Check these plugin settings:

- **Git Wall data folder** controls where generated JSON is stored.
- **Daily note folder** controls where dated notes are created or updated.
- **Scan roots** controls folders or drives searched by **Discover
  repositories**.
- **Tracked repositories** controls exact repos that get scanned.

## Changed heading created a duplicate section

The Daily section heading is the marker used for insert/replace. If you change
that heading, LJ OS starts looking for the new marker. Delete or rename the old
section once.

## Reset labels did not change my existing note

**Reset labels** restores setting defaults. It does not rewrite existing note
content until you insert or replace the Git Wall again.

## Dashboard Layout did not change scan data

Expected. **Dashboard Layout** changes generated section order only. It does not
change scanning, tracked repos, JSON data, or section content.

## Emoji toggle looks confusing

Emoji mode changes rendered output only. It does not rewrite saved setting text,
so a setting field may still contain emoji while rendered output is emoji-free.

## Manual install issues

Check that these individual release assets are in:

```text
<vault>/.obsidian/plugins/lj-os/
```

Required files:

```text
main.js
manifest.json
```

If the release includes `styles.css`, include it in the same folder. Then
reload Obsidian plugins and enable **LJ OS**.

## Release or installation asset mismatch

For Obsidian releases, the GitHub release tag and name must exactly match the
version in `manifest.json`, with no `v` prefix. Release assets must be
individual files: `main.js`, `manifest.json`, and `styles.css` if present.

If a user downloads only a source zip, Obsidian will not treat that as the
normal release asset set.

## Obsidian plugin reload

If changes do not appear, disable and re-enable the plugin. If that still does
not work, restart Obsidian.
