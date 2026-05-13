# LJ OS Obsidian Plugin

Local Obsidian plugin for inserting the LJ OS daily dyno sheet into an
Obsidian Daily Note.

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

The companion CLI should write one JSON dyno sheet per day inside the vault:

```text
G:\WASH3DVault\LJ OS\stats\YYYY-MM-DD.json
```

The plugin reads this as a vault-relative path:

```text
LJ OS/stats/YYYY-MM-DD.json
```

## Commands

- **Insert Today's Dyno Sheet** reads today's JSON dyno sheet, creates today's
  Daily Note if needed, and inserts or replaces the configured LJ OS section.

If today's dyno sheet is missing, the plugin shows a Notice that it has not
been generated yet.

The JSON dyno sheet is internal data produced by `obsidian-lj-os-cli` for this
plugin. Users normally interact with the rendered LJ OS section in the Daily
Note, and the plugin does not expose a command for opening raw JSON.

## Plugin settings

- **Dyno sheet folder** defaults to `LJ OS/stats`.
- **Daily note folder** defaults to `Daily Notes`.
- **Daily section heading** defaults to `## 🏁 Git Your Daily`.
- **Summary callout title** defaults to `🏁 Git Your Daily`.
- **Repository section title** defaults to `🧰 Repo Garage`.
- **Tidy-up section title** defaults to `🧹 Tidy-Up Queue`.
- **Use emoji** defaults to on.
- **Show summary** defaults to on.
- **Show repository table** defaults to on.
- **Show tidy-up queue** defaults to on.
- **Table format** defaults to `standard`; allowed values are `compact`,
  `standard`, and `detailed`.

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
`## 🏁 Git Your Daily`, that main heading remains unchanged because it is the
replacement marker.

The summary, repository table, and tidy-up queue can each be hidden. If all
three are hidden, the rendered section falls back to:

```markdown
No LJ OS sections are enabled.
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

When emoji mode is on, the rendered table headers and status values use the
emoji-forward labels.

## Rendered section

### Emoji mode

With **Use emoji** enabled:

```markdown
## 🏁 Git Your Daily

Generated: May 12, 2026, 9:00 PM PDT

> [!summary] 🏁 Git Your Daily
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
## Git Your Daily

Generated: May 12, 2026, 9:00 PM PDT

> [!summary] Git Your Daily
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

- Reads schema version `0.1.0` JSON dyno sheets from the vault.
- Uses local calendar dates in `YYYY-MM-DD` format.
- Writes to `Daily Notes/YYYY-MM-DD.md` by default.
- Generates markdown with a readable generated timestamp, summary callout,
  repo garage table, tidy-up queue, repo notes, customizable section titles,
  visibility toggles, table formats, and optional emoji rendering.
- Replaces the configured LJ OS section instead of duplicating it.
- Does not expose raw JSON viewing or debug-note commands.
- Does not call Git, access OS telemetry, or use the GitHub API.
- Does not add external runtime dependencies.
