# Troubleshooting

## Today's Git Wall data is missing

Make sure the companion CLI has generated today's JSON file:

```text
LJ OS/stats/YYYY-MM-DD.json
```

Run the CLI first, then run **LJ OS: Insert Today's Git Wall** again.

## Wrong folder

Check these plugin settings:

- **Git Wall data folder** should match where the CLI writes JSON.
- **Daily note folder** should match where you want dated notes created.

The default Git Wall data folder is:

```text
LJ OS/stats
```

## Changed heading created a duplicate section

The Daily section heading is the marker used for insert/replace. If you change
that heading, the plugin starts looking for the new marker. Delete or rename the
old section once.

## Emoji toggle looks confusing

Emoji mode changes rendered output only. It does not rewrite saved setting
text, so a setting field may still contain emoji while rendered output is
emoji-free.

## The plugin is not scanning Git repos

Correct. The companion CLI scans repos. This plugin only reads JSON from the
vault and renders it into a Daily Note.

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

Then reload Obsidian plugins and enable **LJ OS** / **Git Wall**.

## Obsidian plugin reload

If changes do not appear, disable and re-enable the plugin. If that still does
not work, restart Obsidian.
