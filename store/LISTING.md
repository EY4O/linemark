# Chrome Web Store listing: Linemark

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
• Lines are colour-coded collections that can branch into sub-lines. Drag links onto a line to file them.
• Give each line an icon (240 built in) or any emoji.
• Tags, notes, favorites, and a Trash with undo.
• Four views: cards, list, compact headlines and moodboard, with a card-size slider.

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
| Screenshot 2: editing a link inside a line | `screenshot-2.png` | 1280×800 |
| Screenshot 3: full-text search (dark theme) | `screenshot-3.png` | 1280×800 |
| Screenshot 4: giving a line an icon | `screenshot-4.png` | 1280×800 |
| Screenshot 5: broken-link checker | `screenshot-5.png` | 1280×800 |
| Small promo tile | `promo-small.png` | 440×280 |
| Marquee promo tile (optional) | `promo-marquee.png` | 1400×560 |

The screenshots use a demo library (`store/demo-seed.html`). The bookmarks point at real public sites, and the cover images are abstract drawings standing in for page screenshots.

**Homepage URL:** `[your site or repository URL]`
**Support URL:** `[your issues page or contact page]`

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
| `tabs` (optional) | Requested only when the user chooses "Save all open tabs", to read the addresses and titles of the window's tabs. |
| `identity` (optional) | Requested only when the user turns on sync, to sign in to Google (Drive app-data scope only). |
| Host permission `<all_urls>` (optional) | Requested only when the user runs a link check, fetches previews, indexes page text, or refreshes a bookmark. Linemark then requests the user's own saved pages directly from their websites. |

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

**Privacy policy URL:** where you publish `docs/privacy.html`, for example `https://<you>.github.io/<repo>/privacy.html`.

> Before publishing, replace `[your contact email]` in `PRIVACY.md` and `docs/privacy.html`.

---

## Distribution tab

- **Visibility:** *Unlisted* while you and friends try it. Anyone with the link can install it, and it doesn't appear in search. Switch to *Public* when ready.
- **Regions:** all.

## Before you submit

1. `node tests/run.mjs`: all tests pass.
2. Bump `"version"` in `manifest.json` for every upload.
3. `node tools/package.mjs`: upload `dist/linemark-<version>.zip`.
4. If built-in Google sign-in is configured (see docs/SYNC.md), the client IDs in `manifest.json` and `js/config.js` must match this item's extension ID.
