# Troubleshooting

## Nothing is inserted

Add at least one scan root in **Settings -> Community plugins -> LJ OS**, click
**Discover repositories**, then run **LJ OS: Insert Today's Git Wall**.

Auto-scan updates the local JSON quietly, but the insert command is still how
you create or replace the Markdown section in a Daily Note. Insert uses cached
JSON only; it does not run Git or wait for a scan.

The fastest path is shown in the **Get started** panel: add a scan root, click
**Discover repositories**, review tracked repos, then click **Scan now**.

## A repo appears under Scan Notes

Check that the tracked path exists and points to a folder with `.git` metadata.
LJ OS does not crawl parent folders or discover repos automatically during
normal scans.

If the note says Git is not available, make sure your local Git installation is
available to Obsidian on PATH.

## Wrong folder

Check these plugin settings:

- **Git Wall data folder** controls where generated JSON is stored.
- **Daily note folder** controls where dated notes are created or updated.
- **Scan roots** controls which folders/drives are searched when you click
  **Discover repositories**.
- **Tracked repositories** controls which exact repos are scanned.

The default Git Wall data folder is:

```text
LJ OS/stats
```

## Today's JSON is missing

Run **LJ OS: Scan Configured Git Repositories** or enable startup/interval
scanning. **LJ OS: Insert Today's Git Wall** does not generate JSON; it inserts
cached data if present, or a fallback message if not.

## Auto-scan is not running

Check these settings:

- **Scan on startup** controls the quiet startup scan.
- **Auto-scan while Obsidian is open** controls interval scans.
- **Scan interval in minutes** must be at least `15`.
- **Tracked repositories** must contain enabled tracked repos.

Automatic scans do not show success notices. Check **Scan status** in settings
or inspect `LJ OS/stats/YYYY-MM-DD.json`.

## Insert is slow

It should not be. Insert reads cached JSON and writes Markdown only. If it feels
slow, check whether a manual scan command was run separately; the insert command
does not call Git.

## Auto-scan is scanning the wrong thing

Auto-scan only reads enabled tracked repo paths from settings. It does not scan
raw scan roots such as `G:\`, crawl all drives, rediscover repositories, scan
hidden/system folders, or search broad folder trees on an interval.

## G:\ is not a Git repository

That is expected for a drive root. Add `G:\` under **Scan roots**, click
**Discover repositories**, and LJ OS will add child repos such as
`G:\obsidian-lj-os-plugin` to **Tracked repositories**. `G:\` itself is scanned
only if `G:\.git` exists.

## No tracked repos found yet

If you have scan roots but no tracked repos, run **Discover repositories**
first. Manual, startup, interval, and view-open scans only scan tracked repos.

## A scan timed out

The default target is 30 seconds. LJ OS records warnings, saves useful partial
data when possible, and future scans can still run. Increase **Max scan duration
seconds** only if your tracked repos routinely need more time.

The max duration control is in **Advanced Scanning Settings**, which is
collapsed by default.

## A manual scan says another scan is running

LJ OS prevents overlapping scans. Wait for the current startup, interval, or
view-open scan to finish, then run the manual command again if needed.

## Changed heading created a duplicate section

The Daily section heading is the marker used for insert/replace. If you change
that heading, the plugin starts looking for the new marker. Delete or rename the
old section once.

## Emoji toggle looks confusing

Emoji mode changes rendered output only. It does not rewrite saved setting
text, so a setting field may still contain emoji while rendered output is
emoji-free.

## Manual install issues

Check that these files are in:

```text
<vault>/.obsidian/plugins/lj-os/
```

Required files:

```text
main.js
manifest.json
```

If a release includes `styles.css`, include it in the same folder. Then reload
Obsidian plugins and enable **LJ OS**.

## Obsidian plugin reload

If changes do not appear, disable and re-enable the plugin. If that still does
not work, restart Obsidian.
