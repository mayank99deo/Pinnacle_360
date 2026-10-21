# Pinnacle 360: notes for Claude

Static showcase hub for decks, product MVPs and documents, presented in meetings to management and the team. No build step: `index.html` + `registry.js` + `assets/`. Hosted on Vercel from `main` of https://github.com/mayank99deo/Pinnacle_360, and every push to `main` redeploys.

**Standing instruction from the user:** when they hand over a deck, MVP link or file, add it to the hub, verify it, then commit and push to `main` so it goes live.

## Adding a handed-over item

1. **Classify it.** Pick a kind (`deck`, `mvp` or `doc`) and a problem space. If none fits, add one to `spaces` in `registry.js` with a short `code`. Sheet number = `<CODE>-<NNN>`, the next free number in that space.
2. **Deck from a Claude Design handoff (`*.dc.html`).** Read it with DesignSync `get_file`: the main file, `deck-stage.js`, and every asset it references. Do **not** ship `support.js` (the dc runtime), because it loads React/Babel from unpkg and `fetch()`es its own files. Port it to plain `<deck-stage>` HTML the way `library/decks/hr-attendance-automation/index.html` was ported:
   - keep the slide markup as-is
   - replace `{{ bindings }}` with `data-k` hooks driven by a vanilla script, and `<sc-for>` with JS-built nodes
   - add `no-rail` to `<deck-stage>`
   - self-host the fonts in `fonts/` (latin + latin-ext woff2; delete byte-identical variable-font duplicates)
   - add `<script src="../../deck-bridge.js"></script>` after `deck-stage.js`
3. **Other decks.** HTML decks go in `library/decks/<id>/` the same way. A `.pptx` can't render in a browser: convert it to PDF and register the PDF as the deck's `path`.
4. **Thumbnails.** Run `tools/snap-thumbs.sh library/decks/<id>` and look at the images, since they double as a render check.
5. **Registry entry** in `registry.js`: `problem` is one plain sentence (it's what people search). For decks, `slides` = `{ title, thumb, notes }` with notes from `data-speaker-notes`. Add `highlights` for key numbers and `tags` for search keywords. Set `updated` to today.
6. **MVPs.** A hosted MVP is a registry entry with `url` (it opens in a new tab). A local build goes in `library/mvps/<id>/` with `path`.
7. **Verify.** Run `node --check` on the edited JS, open the hub in headless Chrome, present the new item, and confirm there are no console errors.
8. **Commit and push to `main`.** Message: what was added, e.g. `Add HR-002 Leave Balance Bot MVP`.

## Deploys

Vercel project `p-dash` (Hobby, owner GitHub account `mayank99deo`) serves https://p-dash-ruby.vercel.app and deploys every push to `main`. Hobby blocks deployments whose commit author isn't the owner, so commits must be authored as `mayank99deo` (this repo's local git config uses `309304990+mayank99deo@users.noreply.github.com`). Pushing itself authenticates as `mayank29deo`, a collaborator, which is fine. After pushing, fetch the live URL to confirm the change is there.

## Conventions

- Design: light purple and white (Pinnacle), Archivo for the hub, drawing-register / title-block motif. Keep new UI consistent with `assets/hub.css` tokens.
- Everything must work from a double-click on `index.html` (file://) as well as on Vercel: no `fetch()`, no CDN dependencies, relative paths only.
