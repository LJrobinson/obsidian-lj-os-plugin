# FAQ

## What is LJ OS Git Wall?

LJ OS Git Wall is a standalone Obsidian desktop plugin that turns local Git
activity into a Daily Note dashboard. It discovers repos from scan roots you
choose, scans enabled tracked repositories, stores daily JSON in your vault,
and renders the Git Wall from that cached data.

## Who is it for?

It is for people who work across multiple local repos and want a quick daily
view of commits, dirty repos, unpushed work, behind branches, and cleanup tasks
without opening several terminals.

## Do I need a companion repo, CLI, app, login, or API key?

No. LJ OS is one standalone Obsidian plugin. It does not require a second repo,
companion app, required CLI, login, API key, cloud service, or GitHub API.

## Does the plugin scan my whole computer?

No. Discovery searches only the scan roots you configure, and only when you
click **Discover repositories**. Scans read enabled tracked repositories only.
Auto-scan does not crawl drives, rediscover repos, or walk broad folder trees.

## What is the fastest setup?

Open LJ OS settings, use the **Git Started** card, add your main repo folder or
drive as a **Scan root**, click **Discover repositories**, review **Tracked
repositories**, then click **Scan now**. After repos are tracked, the card says
**Setup Complete ☑️**.

## What is the difference between scan roots and tracked repositories?

**Scan roots** are folders or drives LJ OS searches for repos when discovery is
manually triggered. Example: `G:\`.

**Tracked repositories** are validated Git repos LJ OS scans automatically.
Example: `G:\obsidian-lj-os-plugin`.

Drive roots belong in **Scan roots**, not **Tracked repositories**.

## Can I use a drive root like G:\?

Yes. Put `G:\` under **Scan roots** and click **Discover repositories**. LJ OS
will look for child repos such as `G:\obsidian-lj-os-plugin`. It will not scan
`G:\` itself unless `G:\.git` exists.

Broad drive roots can be slower to discover. A specific parent folder such as
`G:\Code` is faster when you know where your repos live.

## Does it auto-scan?

Yes. By default, LJ OS scans tracked repos on startup and every 60 minutes while
Obsidian is open. If enabled, view-open refresh shows cached data first and then
quietly refreshes stale scan data in the background.

## Does inserting Git Wall run a scan?

No. Insert reads today's cached JSON and renders immediately. If no data exists
yet, it inserts a helpful fallback message instead of running Git.

## How long should scans take?

Manual scans can take several seconds depending on repo count, disk speed, and
Git availability. The default scan budget is 30 seconds. If the budget is
exceeded, LJ OS records warnings and saves useful partial data when possible.

## Where is activity data stored?

By default, daily JSON snapshots are stored inside your vault:

```text
LJ OS/stats/YYYY-MM-DD.json
```

You can change the Git Wall data folder in plugin settings.

## Does it send my repo data anywhere?

No. LJ OS itself sends nothing anywhere. It reads local Git metadata and writes
local JSON in your vault. If you use Obsidian Sync or another sync service, that
service may sync vault files independently of LJ OS.

## Why is it desktop-only?

Local filesystem and Git command access are desktop Obsidian capabilities. LJ
OS is not intended for mobile unless the architecture changes in the future.

## Can I reorder the generated sections?

Yes. Use **Dashboard Layout** in settings. **Move up** and **Move down** change
the order of Git Scoreboard, Repository Activity, and Cleanup Checklist.
**Reset layout** restores the default order. This changes output order only; it
does not affect scanning.

## Can I customize titles?

Yes. Enable **Show customized label settings** to edit the Daily section
heading, summary title, repository section title, and tidy-up section title.
Use **Reset labels** to restore defaults.

## Can I turn off emoji?

Yes. Turn off **Use emoji** in plugin settings. The plugin renders emoji-free
labels without rewriting your saved title settings.

## Can I hide sections?

Yes. You can hide the summary section, repository section, and tidy-up section
independently.

## Can I use this without Obsidian's Daily Notes core plugin?

Yes. LJ OS writes to a date-based markdown file in the configured Daily note
folder. You do not need Obsidian's core Daily Notes plugin enabled, but Git Wall
is designed around a Daily Note workflow.
