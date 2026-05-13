# FAQ

## What is Git Wall?

Git Wall is an Obsidian plugin that renders a daily snapshot of local Git repo
activity into your Daily Note.

## Do I need the CLI?

Yes. Git Wall reads JSON produced by the companion CLI:

https://github.com/LJrobinson/obsidian-lj-os-cli

The CLI scans repos and writes JSON into your vault. The plugin renders that
JSON.

## Does the plugin scan my computer?

No. The plugin does not scan folders, call Git, use the GitHub API, or collect
OS telemetry.

## Why JSON?

JSON keeps the workflow simple: the CLI handles repo scanning, and the plugin
handles Obsidian rendering.

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
