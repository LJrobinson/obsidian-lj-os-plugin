# LJ OS Obsidian Plugin

Local Obsidian plugin for inserting the LJ OS Git Wall into an Obsidian Daily
Note.

## Local install

1. Generate the plugin files from this repo, or use the checked-in `main.js`
   directly.
2. Copy or symlink this folder into your vault plugins folder:

   ```text
   G:\WASH3DVault\.obsidian\plugins\lj-os
   ```

3. In Obsidian, open **Settings -> Community plugins**.
4. Turn off **Restricted mode** if needed.
5. Enable **LJ OS**.

This v0.1.0 implementation does not require `npm install` or a build step.

## Expected CLI output path

The companion CLI should write one JSON data file per day inside the vault:

```text
G:\WASH3DVault\LJ OS\stats\YYYY-MM-DD.json
```

The plugin reads this as a vault-relative path:

```text
LJ OS/stats/YYYY-MM-DD.json
```

## Commands

- **Insert Today's Git Wall** reads today's JSON data, creates today's
  Daily Note if needed, and inserts or replaces the configured LJ OS section.

If today's Git Wall data is missing, the plugin shows a Notice that it has not
been generated yet.

The JSON file is internal data produced by `obsidian-lj-os-cli` for this
plugin. Users normally interact with the rendered LJ OS section in the Daily
Note, and the plugin does not expose a command for opening raw JSON.

## Plugin settings

- **Git Wall data folder** defaults to `LJ OS/stats`.
- **Daily note folder** defaults to `Daily Notes`.
- **Daily section heading** defaults to `## 🧱 Git Wall`.
- **Summary callout title** defaults to `🏁 Git Wall`.
- **Repository section title** defaults to `🧰 Repo Garage`.
- **Tidy-up section title** defaults to `🧹 Tidy-Up Queue`.
- **Use emoji** defaults to on.
- **Show summary** defaults to on.
- **Summary style** defaults to `callout`; allowed values are `callout`,
  `scoreboard`, and `pit-wall`.
- **Show repository section** defaults to on.
- **Repo view** defaults to `table`; allowed values are `table` and
  `status-cards`.
- **Show tidy-up section** defaults to on.
- **Tidy view** defaults to `queue`; allowed values are `queue` and
  `shutdown-checklist`.
- **Table format** defaults to `standard`; allowed values are `compact`,
  `standard`, `detailed`, and `emoji-board`.

Settings are stored with Obsidian's `loadData` and `saveData` plugin APIs.

The Daily section heading is the exact Markdown heading used to find and
replace the existing section. Existing users may still have
`## LJ OS Daily Dyno Sheet`; change it in plugin settings if you want the new
visible title.

If you change the Daily section heading, the plugin looks for the new heading
the next time it inserts. That can create a new section unless you manually
update or remove the old heading in the Daily Note.

Emoji mode changes rendered output but does not rewrite saved setting text. If
you turn emoji off but leave the Daily section heading as
`## 🧱 Git Wall`, that main heading remains unchanged because it is the
replacement marker.

The summary, repository section, and tidy-up section can each be hidden. If all
three are hidden, the rendered section falls back to:

```markdown
No LJ OS sections are enabled.
```

All view settings are render-only views over the same CLI JSON. They do not
change the JSON schema, the expected CLI output path, or Daily Note placement.

## Summary styles

`callout` keeps the default summary block:

```markdown
> [!summary] 🏁 Git Wall
> 🧭 Scanned: **23** repos
> 🛠️ Touched: **4** repos
> 🏁 Commits: **26**
> 🧼 Tidy up: **5** repos
> 🚀 Unpushed: **0**
> 📥 Behind remote: **0**
```

`scoreboard` renders a stat table:

```markdown
### 🎮 Git Scoreboard

| Stat | Value |
| --- | ---: |
| 🧭 Repos scanned | 23 |
| 🛠️ Repos touched | 4 |
| 🏁 Commits | 26 |
| 🧼 Tidy-up queue | 5 |
| 🚀 Unpushed | 0 |
| 📥 Behind | 0 |
```

`pit-wall` renders interpreted status:

```markdown
### 🧱 Pit Wall

| Signal | Status |
| --- | --- |
| 🏁 Activity | 26 commits across 4 repos |
| 🧼 Garage | 5 repos need tidy-up |
| 🚀 Launch | Clear, nothing unpushed |
| 📥 Sync | Clear, nothing behind |
```

## Table formats

`compact`:

```markdown
| Repo | Branch | Status | Commits |
| --- | --- | :---: | ---: |
```

`standard`:

```markdown
| Repo | Branch | Commits | Status | Unpushed | Behind | Latest |
| --- | --- | ---: | :---: | ---: | ---: | --- |
```

`detailed`:

```markdown
| Repo | Branch | Commits | Status | Unpushed | Behind | Latest | Path |
| --- | --- | ---: | :---: | ---: | ---: | --- | --- |
```

`emoji-board`:

```markdown
| Repo | Branch | Activity | Tidy | Push | Pull |
| --- | --- | :---: | :---: | :---: | :---: |
```

When emoji mode is on, the rendered table headers and status values use the
emoji-forward labels.

Emoji-board mode turns repo activity into a compact status board:

```markdown
| 🧰 Repo | 🌿 Branch | 🏁 Activity | 🧼 Tidy | 🚀 Push | 📥 Pull |
| --- | --- | :---: | :---: | :---: | :---: |
| CannabisMath | main | 🏁🏁 | ✅ | ✅ | ✅ |
| CannabisCOA.Parser | main | 🏁 | 🧹 | 🚀 2 | 📥 1 |

> 🏁 activity · 🧹 tidy needed · ✅ clear · 🚀 unpushed · 📥 behind remote
```

Table format applies only when Repo view is `table`.

## Repo views

`table` uses the selected table format.

`status-cards` renders one Obsidian callout per repo:

```markdown
### 🧰 Repo Garage

> [!success] moby-atlas `main`
> 🏁 12 commits · ✅ clean · 🚀 0 unpushed · 📥 0 behind  
> b78bcc7 - Finalize first MOBY Atlas release

> [!warning] obsidian-lj-os-cli `main`
> 🏁 1 commit · 🧹 tidy needed · 🚀 0 unpushed · 📥 0 behind  
> 1c2a7b - first commit
```

With emoji mode off:

```markdown
> [!success] moby-atlas `main`
> 12 commits · clean · 0 unpushed · 0 behind  
> b78bcc7 - Finalize first MOBY Atlas release
```

## Tidy views

`queue` keeps the normal tidy-up queue.

`shutdown-checklist` renders end-of-day checks:

```markdown
### 🧹 Shutdown Checklist

- [ ] 🧹 CannabisCOA.Parser `main` needs tidy-up
- [x] 🚀 No unpushed commits
- [x] 📥 No repos behind remote
```

If everything is clean, it also includes:

```markdown
- [x] ✅ Garage closed clean
```

## Rendered section

### Emoji mode

With **Use emoji** enabled:

```markdown
## 🧱 Git Wall

Generated: May 12, 2026, 9:00 PM PDT

> [!summary] 🏁 Git Wall
> 🧭 Scanned: **23** repos
> 🛠️ Touched: **4** repos
> 🏁 Commits: **26**
> 🧼 Tidy up: **5** repos
> 🚀 Unpushed: **0**
> 📥 Behind remote: **0**

### 🧰 Repo Garage

| Repo | 🌿 Branch | 🏁 Commits | 🧼 Status | 🚀 Unpushed | 📥 Behind | Latest |
| --- | --- | ---: | :---: | ---: | ---: | --- |
| CannabisMath | main | 3 | ✅ Clean | 0 | 0 | abc1234 - Update formulas |
| CannabisCOA.Parser | main | 1 | 🧹 Tidy | 0 | 0 | def5678 - Parse potency notes |

### 🧹 Tidy-Up Queue

- 🧹 CannabisCOA.Parser `main`
```

### Emoji-free mode

With **Use emoji** disabled, leading emojis in configured titles are stripped
during render:

```markdown
## Git Wall

Generated: May 12, 2026, 9:00 PM PDT

> [!summary] Git Wall
> Scanned: **23** repos
> Touched: **4** repos
> Commits: **26**
> Tidy up: **5** repos
> Unpushed: **0**
> Behind remote: **0**

### Repo Garage

| Repo | Branch | Commits | Status | Unpushed | Behind | Latest |
| --- | --- | ---: | :---: | ---: | ---: | --- |
| CannabisMath | main | 3 | Clean | 0 | 0 | abc1234 - Update formulas |
| CannabisCOA.Parser | main | 1 | Tidy | 0 | 0 | def5678 - Parse potency notes |

### Tidy-Up Queue

- CannabisCOA.Parser `main`
```

If no dirty repos exist, the tidy-up queue renders:

```markdown
All scanned repos are clean.
```

## v0.1.0 scope

- Reads schema version `0.1.0` Git Wall JSON data from the vault.
- Uses local calendar dates in `YYYY-MM-DD` format.
- Writes to `Daily Notes/YYYY-MM-DD.md` by default.
- Generates markdown with a readable generated timestamp, summary views,
  repo garage views, tidy-up views, repo notes, customizable section titles,
  visibility toggles, table formats, and optional emoji rendering.
- Replaces the configured LJ OS section instead of duplicating it.
- Does not expose raw JSON viewing or debug-note commands.
- Does not call Git, access OS telemetry, or use the GitHub API.
- Does not add external runtime dependencies.
