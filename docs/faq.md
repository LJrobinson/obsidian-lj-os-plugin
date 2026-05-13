# FAQ

## What is Git Wall?

Git Wall is an Obsidian desktop plugin that discovers repos from manual scan
roots, quietly scans enabled tracked local Git repositories, and renders a daily
activity snapshot into your Daily Note.

## Do I need a companion CLI?

No. LJ OS is standalone. The plugin scans enabled tracked local repos itself,
stores generated JSON in your vault, and renders from that local data.

## Does the plugin scan my whole computer?

No. It scans only enabled tracked repository paths. Auto-scan does not crawl
drives, rediscover repos, or walk broad folder trees.

## Is discovery automatic?

Discovery is manual: add scan roots such as `G:\` or `C:\Repos`, then click
**Discover repositories**. Startup, interval, and view-open scans only read the
tracked repos discovered from those roots or entered manually.

## What is the fastest setup?

Open LJ OS settings, use the **Get started** panel, add your main repo folder or
drive as a scan root, click **Discover repositories**, review tracked repos, and
click **Scan now**.

## Can I use a drive root like G:\?

Yes. Put `G:\` under **Scan roots**, not **Tracked repositories**. LJ OS will
search child folders for `.git` metadata when you click **Discover
repositories**. It will not scan `G:\` itself unless `G:\.git` exists.

## Does it auto-scan?

Yes. By default, LJ OS scans on startup, every 60 minutes while Obsidian is
open, and when a stale LJ OS note opens. Manual scan is still available as a
fallback.

## Does inserting Git Wall run a scan?

No. Insert reads today's cached JSON and renders immediately. If no data exists
yet, it inserts a helpful fallback message instead of running Git.

## Does it use GitHub, APIs, logins, or cloud services?

No. It uses local Git metadata and local Git command output when available. It
does not call GitHub, require API keys, send telemetry, or use remote services.

## Where is activity data stored?

By default, daily JSON snapshots are stored in:

```text
LJ OS/stats/YYYY-MM-DD.json
```

That path is inside your vault and can be changed in plugin settings.

## How long should scans take?

The default scan budget is 30 seconds. If the budget is exceeded, LJ OS records
warnings and saves useful partial data when possible.

## Do I need advanced scanning settings?

Usually no. Advanced scanning settings are collapsed by default because most
users only need scan roots, tracked repositories, automation, and Scan now.

## Why is it desktop-only?

Local filesystem and Git command access are desktop Obsidian capabilities, so
the plugin is intentionally desktop-first.

## Can I customize titles?

Yes. You can customize the main section heading, summary title, repo section
title, and tidy-up section title.

## Can I turn off emoji?

Yes. Turn off **Use emoji** in plugin settings. The plugin renders emoji-free
labels without rewriting your saved title settings.

## Can I hide sections?

Yes. You can hide the summary section, repository section, and tidy-up section
independently.

## Can I use this without Daily Notes?

The plugin writes to a date-based markdown file in the configured Daily note
folder. You do not need Obsidian's core Daily Notes plugin enabled, but Git Wall
is designed around that Daily Note pattern.
