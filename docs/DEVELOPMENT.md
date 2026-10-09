# Developing Ember

Ember is plain HTML, CSS and JavaScript (ES modules). There is no build step and no package manager.

## Layout

```
manifest.json        Manifest V3: permissions, popup, service worker, omnibox, commands
app.html             The library tab
popup.html           The toolbar quick-save popup
css/base.css         Design tokens, line bullets, buttons, fields, menus (shared)
css/app.css          Library layout: signage band, station sign, the four views, drawer, settings
css/popup.css        Popup layout
js/db.js             IndexedDB wrapper + BroadcastChannel change notifications
js/model.js          Shared domain logic: bookmarks, URL normalisation, line colours, page metadata
js/app.js            Library state, rendering, drag and drop, keyboard, settings
js/popup.js          Save-on-open popup
js/background.js     Service worker: context menus, shortcuts, omnibox, opening the library
js/io.js             Chrome tree import, Netscape HTML import/export, JSON backup/restore
js/ui.js             Toasts, anchored menus, time formatting, downloads
js/icons.js          Authored SVG icon set
fonts/               Archivo variable font (OFL)
icons/               Extension icons
```

## Running it

1. Open `chrome://extensions`, turn on **Developer mode**, then **Load unpacked** this folder.
2. After editing:
   - **Library or popup pages:** reload the page.
   - **`background.js`, `manifest.json` or anything the service worker imports:** click the reload arrow on Ember's extension card.
3. To debug, open the library tab's DevTools. For the service worker, click **Inspect views: service worker** on the extension card.

`app.html` also runs as a plain web page served from any static server. The `chrome.*` features are missing there: Chrome import, favicons, saving tabs and the popup. This is handy for UI work:

```bash
python -m http.server 5178
```

Then open `http://localhost:5178/app.html`. A page served this way has its own IndexedDB, separate from the extension's.

## Data model

| Store | Contents |
|---|---|
| `bookmarks` | `{ id, url, title, excerpt, note, cover, coverSource, collectionId, tags[], favorite, type, createdAt, updatedAt, trashedAt, metaFetched, textAt?, health? }` |
| `collections` | `{ id, name, code, color, parentId, order, expanded, createdAt }`. These are the "lines" |
| `media` | Stored cover images: screenshots and downloaded page images. A bookmark refers to one as `cover: "media:<id>"`; covers are never loaded from the web |
| `texts` | `{ id, text }`: readable page text for full-text search, keyed by bookmark id |
| `meta` | `ui` preferences (view, sort, card size, theme) |

Writes made in one context (popup, service worker, library) are announced on the `ember` BroadcastChannel, so open library tabs reload automatically.

## Tests

```bash
node tests/run.mjs
```

The suite needs Google Chrome but no npm packages (set `CHROME_PATH` if Chrome isn't in a standard place; add `--headed` to watch it). It starts a local server, drives Chrome over the DevTools protocol, and never contacts the internet. It covers:

- **Model and import/export:** URL normalisation, line-colour contrast and assignment, page metadata, link-health classification, the bookmark-HTML round trip, and backup validation (unsafe or malformed entries are dropped).
- **Library:** first render, search filters, accessibility checks in all four views and at 320px (contrast, names, nesting, overflow), and keyboard access (line expand, menus, the drawer's focus trap and return).
- **Link health, full-text search and local covers:** against local pages that answer 200, 404, 403, a cross-host redirect and an unreachable port.
- **Real extension:** loads Ember unpacked into a fresh profile, then checks the first-run screen, Chrome bookmark import, Settings, dark mode, the popup and the service worker's shortcuts.

Run it before every change. A first-run crash (a blank page on a fresh install) reached a user once; the extension suite now catches that class of bug.

Test fixtures live in `tests/fixtures/`. The library tests run `app.html` with a small `chrome.*` stub, each in its own isolated browser context so storage starts empty.

## Packaging

Zip the folder contents. Leave out `.impeccable/`, `.claude/`, `docs/`, `tests/` and the Markdown files if you want a smaller package. Upload the zip through the Chrome Web Store developer dashboard.
