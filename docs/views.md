# Views

All views render the same CLI JSON. They only change how the Git Wall appears
in your Daily Note.

For rendered Markdown examples of every supported layout, see the
[Example Output Gallery](../README.md#example-output-gallery).

## Summary Styles

- **Callout**: the default Obsidian summary callout.
- **Scoreboard**: a stat table with one metric per row.
- **Pit Wall**: interpreted status for activity, cleanup, push, and sync.

## Repo Views

- **Table**: renders repos in a markdown table.
- **Status Cards**: renders each repo as a success or warning callout.

## Table Formats

- **Compact**: repo, branch, status, commits.
- **Standard**: repo, branch, commits, status, unpushed, behind, latest.
- **Detailed**: standard plus repo path.
- **Emoji Board**: visual activity/tidy/push/pull board.

## Tidy Views

- **Queue**: simple list of dirty repos.
- **Shutdown Checklist**: checkbox list for tidy-up, push review, and sync
  review.

## Suggested Combinations

### Quick Dashboard

- Summary style: `pit-wall`
- Repo view: `table`
- Table format: `emoji-board`
- Tidy view: `queue`

### Focus Mode

- Summary style: `callout`
- Repo view: `status-cards`
- Tidy view: `queue`

### Shutdown Checklist Mode

- Summary style: `pit-wall`
- Repo view: `table`
- Table format: `compact`
- Tidy view: `shutdown-checklist`

### No-Emoji Professional Mode

- Use emoji: off
- Summary style: `scoreboard`
- Repo view: `table`
- Table format: `standard`
- Tidy view: `shutdown-checklist`
