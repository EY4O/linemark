# Chrome Web Store listing: Linemark

**Item ID:** `laapaiiaipeoilipnbhpjmjbdkomhjln` ([store page](https://chromewebstore.google.com/detail/laapaiiaipeoilipnbhpjmjbdkomhjln), live once published)

Paste each section into the matching field of the [Developer Dashboard](https://chrome.google.com/webstore/devconsole). The images are in `store/images/`; rebuild them with `node tools/store-assets.mjs`. Build the upload ZIP with `node tools/package.mjs`.

---

## Store listing tab

**Name** (from the manifest): `Linemark — Bookmark Manager`

**Summary** (the manifest `description`, 127 of 132 characters):
> Bookmarks on colour-coded lines, with tags, notes, full-text search and a broken-link checker. Local by default; sync optional.

**Category:** Productivity

**Language:** English

**Description** (plain text):

```
A bookmark manager drawn like a transit map.

Every collection is a coloured line and every link a stop, with full-text search and a broken-link checker. Local by default; sync optional.

Save in one gesture
Save any page from the toolbar, the right-click menu or Alt+Shift+S, with its title, description and cover.
Right-click selected text to keep it as a highlight, or an image to save it, stored with the page it came from.
Save a whole window of tabs, or bring in your Chrome bookmarks in one click.

Organise on lines
Colour-coded lines that branch into sub-lines, each with an icon, a site's logo or an emoji. Type Cooking/Baking to make a branch as you save.
A link can stop on several lines, and smart lines keep a search as a line that fills itself.
Tags, notes, favourites, and five views, including a network map of your library.

Find anything again
Search the words inside every page you save, and see the passage that matched.
Filter by #tag, site:, type: or is:fav, or search from the address bar by typing lm.

Keep links healthy
The link checker sorts dead, moved and unverified links, with one-click fixes and the Internet Archive's copy of a dead page.
A duplicate finder merges tags and notes into the copy it keeps.

Come back to it
Give a link a day to revisit, and it waits for you on the Departures board.
Linemark Wrapped shows your year on the lines, month by month.

Make it yours
Recolour your lines with a palette inspired by city transit maps, or any colour you like, in light or dark.
Optional suggestions for a line, tags and a summary from Chrome's built-in AI, worked out on your computer.

Private by default
No account, no server, no tracking. Your library stays in your browser.
Optional sync through your own Google Drive, encrypted on your device with AES-256 before it leaves.
Export to HTML or a full JSON backup at any time.
```

**Graphic assets** (all in `store/images/`):

| Field | File | Size |
|---|---|---|
| Store icon | `icon-128.png` | 128×128 |
| Screenshot 1: "Bookmarks on lines." The library, with a lens on a line and its branches | `screenshot-1.png` | 1280×800 |
| Screenshot 2: "Find anything again." Full-text search (dark), with a lens on the matched passage | `screenshot-2.png` | 1280×800 |
| Screenshot 3: "Keep links healthy." The broken-link checker, with a lens on a Dead label | `screenshot-3.png` | 1280×800 |
| Screenshot 4: "Your library as a transit map." The network map's shaped stations and the city palettes | `screenshot-4.png` | 1280×800 |
| Screenshot 5: "Private by default." Local storage, encrypted sync, your own Drive, export | `screenshot-5.png` | 1280×800 |
| Small promo tile | `promo-small.png` | 440×280 |
| Marquee promo tile (optional) | `promo-marquee.png` | 1400×560 |

The screenshots are composed slides (`store/promo/slides.html`) over captures of the real app in `store/images/raw/`, taken with a demo library (`store/demo-seed.html`). The bookmarks point at real public sites, and the cover images are abstract drawings standing in for page screenshots.

**Homepage URL:** `https://linemark.eternalpose.io/`
**Support URL:** `https://github.com/EY4O/linemark/issues`

---

## Privacy tab

**Single purpose:**
> Save, organise and find bookmarks locally in the browser, with optional end-to-end encrypted sync to the user's own Google Drive.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `storage` | Stores the user's bookmark library and settings locally in the browser profile. |
| `unlimitedStorage` | The library includes cover images and page text for search; without this, Chrome could evict large libraries. |
| `activeTab` | When the user clicks the toolbar button, shortcut or context menu, Linemark reads that tab's title, address and description and takes a screenshot to save it. |
| `scripting` | Runs a one-off read of the page the user chose to save (title, description, cover image and readable text). It runs only on that tab, at the user's request. |
| `contextMenus` | Adds "Save page to Linemark", "Save link to Linemark", "Save highlight to Linemark" (on selected text) and "Save image to Linemark" (on an image) to the right-click menu. |
| `bookmarks` | Lets the user import their existing Chrome bookmarks into Linemark (read only). |
| `favicon` | Shows site icons from Chrome's local favicon cache, so no third-party icon service is needed. |
| `tabs` (optional) | Requested only when the user chooses "Save all open tabs" or "Save tab groups as lines", to read the addresses and titles of the window's tabs. |
| `tabGroups` (optional) | Requested only when the user opens a line as a tab group (to title and colour the group) or saves their tab groups as lines (to read each group's title and colour). |
| `identity` (optional) | Requested only when the user turns on sync, to sign in to Google (Drive app-data scope only). |
| Host permission `<all_urls>` (optional) | Requested only when the user runs a link check, fetches previews, indexes page text, or refreshes a bookmark. Linemark then requests the user's own saved pages directly from their websites. When the user chooses "Find archived copy" on a dead link, it asks archive.org (origin https://archive.org/*) for that one link. |

**Remote code:** No, I am not using remote code. All scripts, fonts and icons are packaged with the extension.

**Data usage.** Linemark handles the following data. It stays on the user's device, or, with optional sync, goes encrypted to the user's own Google Drive. It is never sent to the developer.
- ☑ **Web history:** the addresses of pages the user chooses to bookmark.
- ☑ **Website content:** titles, descriptions, cover images, screenshots and readable text of pages the user saves.
- ☑ **Authentication information:** only with optional sync, a short-lived Google access token kept on the device.
- Everything else (personal identity, health, financial, communications, location, user activity): not handled.

**Certify all three:**
- ☑ I do not sell or transfer user data to third parties, outside of the approved use cases.
- ☑ I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** `https://linemark.eternalpose.io/privacy.html`

It is served by GitHub Pages straight from this repository's `docs/` folder (custom domain `linemark.eternalpose.io`, set in `docs/CNAME`), so changing `docs/privacy.html` and pushing publishes it. The old address, ey4o.github.io/linemark-site/, redirects there.

> The contact address in `PRIVACY.md` and `docs/privacy.html` is iamlooneth@gmail.com.

---

## Distribution tab

- **Visibility:** 1.0.0 was approved as *Unlisted*: anyone with the link can install it, and it doesn't appear in search. Switch to *Public* when you want people to find it.
- **Regions:** all.

## Uploading 1.4.0

1. **Package → Upload new package:** `dist/chrome-1.4.0.zip` (site logos and custom line colours; 1.3.3 only named the browser in its text).
2. **Store listing → Description:** paste the description above. Keep it free of lists of names (cities, brands): 1.4.0 was first rejected for keyword spam ("Yellow Argon") over the list of city palettes, so the description now says "a palette inspired by city transit maps" and "a site’s logo" without naming them.
3. **Privacy:** no new permissions; the justifications above still cover everything.
4. **Submit for review.**

**1.4.1** follows once 1.4.0 is approved: upload `dist/chrome-1.4.1.zip` (the popup's line picker becomes a checklist for several lines; the network map gains transfer bars, site icons, a key, fit to width, a fixed name column, hover to follow and link previews). No new permissions, and the description doesn't change.

The Edge listing takes the same version: upload `dist/edge-1.4.0.zip` in Partner Center (see `store/EDGE.md`) and paste its description there.

## Before you submit

1. `node tests/run.mjs`: all tests pass.
2. Bump `"version"` in `manifest.json` for every upload.
3. `node tools/package.mjs`: upload `dist/chrome-<version>.zip` (Edge takes `dist/edge-<version>.zip`, see `store/EDGE.md`).
4. If built-in Google sign-in is configured (see docs/SYNC.md), the client IDs in `manifest.json` and `js/config.js` must match this item's extension ID.
