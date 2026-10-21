# Pinnacle 360

One place to keep and present decks, product MVPs and other pages in meetings.

**Open it:** double-click `index.html`. No server, no install, no internet needed. Fonts and assets are all local.

**Online:** deployed on Vercel from the `main` branch of [mayank99deo/Pinnacle_360](https://github.com/mayank99deo/Pinnacle_360). Every push to `main` goes live automatically.

## Deploying on Vercel (one time)

1. On vercel.com, **Add New → Project** and import `mayank99deo/Pinnacle_360`.
2. Set Framework Preset to **Other**. Leave Build Command and Output Directory empty (it's a static site served from the repo root).
3. Deploy. To keep it internal, turn on **Settings → Deployment Protection** so only people you allow can open it.

## Using it in a meeting

| To do this | Do this |
|---|---|
| Present a deck | Click its sheet. Arrow keys move slides. |
| Full screen | `F` (or the Full screen button) |
| Speaker notes | `N`. Notes show beside the deck on your screen; full screen hides them. |
| Back to the library | `Esc` |
| Search | `/` or `⌘K`, type, then `Enter` opens the top result |
| Start at a specific slide | Pick it in the strip under the big preview, or in Details |
| Plan a meeting | Add items to the **Run-sheet**, then **Present run-sheet** to go through them in order |
| Share a direct link | Details → Copy link. It opens straight into that item. |

Search covers titles, problem statements, keywords, sheet numbers (`HR-001`), slide titles and speaker notes.

## Adding things

Everything in the library is listed in **`registry.js`**. Edit it, save, refresh the page.

### A deck

1. Put the deck in its own folder: `library/decks/<deck-name>/index.html` (plus its images and fonts).
2. If it's a `<deck-stage>` deck, add this line after `deck-stage.js` so the presenter can show the slide counter, strip and notes:
   ```html
   <script src="../../deck-bridge.js"></script>
   ```
   Decks without it still open; you just lose those extras.
3. Generate slide previews (needs Google Chrome):
   ```sh
   tools/snap-thumbs.sh library/decks/<deck-name>
   ```
4. Add an entry to `items` in `registry.js`. Copy the HR Attendance Automation entry as a template; `slides` lists each slide's title, thumbnail and notes.

> Claude Design exports (`*.dc.html`) depend on a React runtime that needs a web server and the internet. Convert them to plain `<deck-stage>` HTML first, the way `library/decks/hr-attendance-automation/` was converted.

### A product MVP

Hosted MVP: add an entry with `kind: 'mvp'` and its `url`. There's a commented template at the bottom of `registry.js`. Clicking it opens the MVP on its own in a new tab.

Local build: put the built front end in `library/mvps/<name>/` and use `path: 'library/mvps/<name>/index.html'` instead of `url`.

For a quick add without editing files, use **Add a link** in the hub. It saves to that browser only and marks the item "This browser only". Open its Details → **Copy registry entry** and paste it into `registry.js` to keep it.

### A document

HTML pages or PDFs go in `library/docs/` with `kind: 'doc'` and a `path`. They open in the presenter.

### A new problem space

Add one to `spaces` in `registry.js`. The `code` prefixes sheet numbers (`HR-001`, `PD-001`) and works as a search keyword:

```js
{ id: 'delivery', code: 'PD', name: 'Project delivery', blurb: 'Scheduling, handovers and site coordination.' },
```

## Registry fields

| Field | Meaning |
|---|---|
| `id` | Unique, lowercase-with-dashes |
| `sheet` | Sheet number shown on the card, e.g. `HR-002` |
| `kind` | `deck`, `mvp` or `doc` |
| `space` | A space `id` from `spaces` |
| `status` | `idea`, `proposal`, `pilot`, `mvp` or `live` |
| `title`, `problem`, `summary` | `problem` is one sentence and the main thing people search |
| `path` or `url` | Where it lives: a path inside this folder, or a web address |
| `highlights` | Optional key numbers: `{ value: '1,760 hrs', label: '…' }` |
| `slides` | Decks only: `{ title, thumb, notes }` per slide |
| `tags` | Extra search keywords |
| `audience`, `owner`, `updated` | Shown in Details; `updated` is `YYYY-MM-DD` and drives sorting |
| `open` | Optional override: `'tab'` or `'viewer'` |

## Folder layout

```
index.html              the hub
registry.js             the library list (edit this)
assets/                 hub styles, script, fonts
library/deck-bridge.js  lets decks talk to the presenter
library/decks/          one folder per deck
library/mvps/           local MVP builds
library/docs/           documents
tools/snap-thumbs.sh    slide preview generator
```

Run-sheet, recent items, layout choice and "Add a link" items are stored in the browser (localStorage), so they're per machine and per browser.
