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
Linemark is a bookmark manager drawn like a transit map. Every collection is a coloured line, every link is a stop, and the screen always tells you where you are.

SAVE IN ONE GESTURE
• Click the toolbar button or press Alt+Shift+S: the page is saved straight away, with its title, description and a cover.
• Right-click any page or link → Save to Linemark.
• Save all your open tabs at once.

ORGANISE ON LINES
• Lines are colour-coded collections that can branch into sub-lines. Drag links onto a line to file them, or type Cooking/Baking to make a branch as you save.
• A link can stop on more than one line, like an interchange station.
• Smart lines: keep any search (#tag, site:, is:fav…) as a line that fills itself.
• Give each line an icon (240 built in) or any emoji.
• Tags, notes, favorites, and a Trash with undo.
• Five views: cards, list, compact headlines, moodboard and a network map that draws your library as a transit map, with each link a station in the shape of its kind (article, video, document, image or plain link).
• Unsorted fills up like a crowded platform: a ring sweeps round it as links wait, so you can see when it's time to file.
• Open a line as a Chrome tab group in its colour, or keep your tab groups as lines.

COME BACK TO IT
• Give a link a day to revisit. On that day it appears on the Departures board.
• Optional suggestions for a line, tags and a summary, made by Chrome's built-in AI on your computer (where Chrome offers it). Nothing is sent anywhere.

MAKE IT YOURS
• City palettes: recolour every line after London, Paris, Tokyo, New York, Berlin or Seoul, and switch back any time.
• Linemark Wrapped: your year on the lines, as a summary or as a ride through the year month by month, with a picture you can save and share.
• An optional station chime when you save a page (off by default).

FIND ANYTHING AGAIN
• Full-text search covers titles, tags, notes and the text of the pages themselves, and shows you the passage that matched.
• Filters: #tag, site:, type:video, is:fav, is:broken.
• Search from the address bar: type "lm", then Space.

KEEP IT HEALTHY
• The broken-link checker sorts links into dead, moved (update the address in one click) and unverified.
• A duplicate finder merges tags and notes into the copy it keeps.

YOURS, AND PRIVATE
• Local by default: no account, no server, no tracking. Your library stays in your browser profile.
• Optional end-to-end encrypted sync through your own Google Drive. Your passphrase encrypts everything on your device, so Google only ever stores scrambled data.
• Import your Chrome bookmarks in one click. Export to HTML or a full JSON backup at any time.

Light and dark themes, full keyboard support, and 44px touch targets on touchscreens.
```

**Graphic assets** (all in `store/images/`):

| Field | File | Size |
|---|---|---|
| Store icon | `icon-128.png` | 128×128 |
| Screenshot 1: the library, with lines and icons | `screenshot-1.png` | 1280×800 |
| Screenshot 2: the network map, each link a station in the shape of its kind | `screenshot-2.png` | 1280×800 |
| Screenshot 3: full-text search (dark theme) | `screenshot-3.png` | 1280×800 |
| Screenshot 4: Linemark Wrapped, the Journey through the year | `screenshot-4.png` | 1280×800 |
| Screenshot 5: broken-link checker | `screenshot-5.png` | 1280×800 |
| Small promo tile | `promo-small.png` | 440×280 |
| Marquee promo tile (optional) | `promo-marquee.png` | 1400×560 |

The screenshots use a demo library (`store/demo-seed.html`). The bookmarks point at real public sites, and the cover images are abstract drawings standing in for page screenshots.

**Homepage URL:** `https://ey4o.github.io/linemark-site/`
**Support URL:** `https://github.com/EY4O/linemark-site/issues`

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
| `contextMenus` | Adds "Save page to Linemark" and "Save link to Linemark" to the right-click menu. |
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

**Privacy policy URL:** `https://ey4o.github.io/linemark-site/privacy.html`

It is published from the public repository [EY4O/linemark-site](https://github.com/EY4O/linemark-site), which holds only that page and its font. After changing `docs/privacy.html` here, copy it (and `docs/fonts/`) into that repository and push.

> The contact address in `PRIVACY.md` and `docs/privacy.html` is iamlooneth@gmail.com.

---

## Distribution tab

- **Visibility:** 1.0.0 was approved as *Unlisted*: anyone with the link can install it, and it doesn't appear in search. Switch to *Public* when you want people to find it.
- **Regions:** all.

## Uploading 1.2.4 (the update after 1.0.0)

1. **Package → Upload new package:** `dist/linemark-1.2.4.zip`.
2. **Store listing → Description:** paste the description above. Since 1.0.0 it adds the network map's shapes, the crowded Unsorted ring, city palettes, Wrapped, the station chime and the `Cooking/Baking` example; the rest is unchanged.
3. **Privacy:** the justifications above already cover the optional `tabs`, `tabGroups` and `identity` permissions and the archive.org lookup that 1.2.4 asks for.
4. **Submit for review.** The only permission new since 1.0.0 is the optional `tabGroups`, which may make this review a little longer.

## Before you submit

1. `node tests/run.mjs`: all tests pass.
2. Bump `"version"` in `manifest.json` for every upload.
3. `node tools/package.mjs`: upload `dist/linemark-<version>.zip`.
4. If built-in Google sign-in is configured (see docs/SYNC.md), the client IDs in `manifest.json` and `js/config.js` must match this item's extension ID.
