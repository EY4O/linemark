# Linemark vs Raindrop.io: feature comparison

Raindrop's plan contents come from [raindrop.io/pro/buy](https://raindrop.io/pro/buy) and [raindrop.io/pro](https://raindrop.io/pro), checked 9 Oct 2026. Neither page shows the Pro price.

Linemark's entries describe what is built in this repository today.

**Key:** ✅ = yes · ◐ = partly · ❌ = no · — = not stated on Raindrop's pages

## Organising

| Feature | Raindrop Free | Raindrop Pro | Linemark |
|---|:-:|:-:|:-:|
| Unlimited bookmarks and collections | ✅ | ✅ | ✅ Limited only by disk space |
| Nested collections | ✅ | ✅ | ✅ "Lines" with branch lines; drag to nest or reorder |
| Tags | ✅ | ✅ | ✅ With autocomplete and bulk tagging |
| Notes on a bookmark | ✅ | ✅ | ✅ Text you've selected on the page becomes the note |
| Favorites | ✅ | ✅ | ✅ |
| Trash and restore | ✅ | ✅ | ✅ Plus Undo on every move, trash or delete |
| Views: list, cards, headlines, moodboard | ✅ | ✅ | ✅ All four, plus a live card-size slider |
| Bulk select, move, tag and trash | ✅ | ✅ | ✅ Shift-click range, Ctrl+A |
| Drag and drop | ✅ | ✅ | ✅ Drag cards onto lines, or drop links from other tabs |
| Filter by type (article, video, image, doc) | ✅ | ✅ | ✅ |
| Dark mode | ✅ | ✅ | ✅ |

## Saving

| Feature | Raindrop Free | Raindrop Pro | Linemark |
|---|:-:|:-:|:-:|
| One-click save from the toolbar | ✅ | ✅ | ✅ Saved the moment the popup opens; refine it afterwards |
| Right-click to save a page or link | ✅ | ✅ | ✅ |
| Keyboard shortcut | ✅ | ✅ | ✅ Alt+Shift+S |
| Save all open tabs | ✅ | ✅ | ✅ Into a new "Session" line |
| Cover image and description | ✅ Fetched by Raindrop's servers | ✅ | ✅ Read from the page itself, or a local screenshot; the image is stored on your computer |
| Highlights on web pages | ✅ | ✅ | ❌ |
| Annotations on highlights | ❌ | ✅ | ❌ |
| File uploads | 100 MB / month | 10 GB / month | ❌ |

## Finding

| Feature | Raindrop Free | Raindrop Pro | Linemark |
|---|:-:|:-:|:-:|
| Search titles, URLs, tags and notes | ✅ | ✅ | ✅ Supports `#tag`, `site:`, `type:`, `is:fav` and `has:note` |
| Full-text search of page contents | ❌ | ✅ | ✅ Page text is kept when you save. Imported links can be indexed from **Settings**. Results show the matching passage |
| Search from the address bar | — | — | ✅ Type `lm`, then Space |
| Keyboard navigation | — | — | ✅ `/`, N, 1–4, E, F, arrow keys, Del |

## Keeping the library healthy

| Feature | Raindrop Free | Raindrop Pro | Linemark |
|---|:-:|:-:|:-:|
| Duplicate finder | ❌ | ✅ | ✅ Keeps the oldest copy and merges tags and notes into it |
| Broken link finder | ❌ | ✅ | ✅ Sorts links into **Dead**, **Moved** (one click to update the address) and **Unverified**. Includes a **Broken links** view and bulk trash |
| Permanent copies / web archive | ❌ | ✅ | ◐ Only the screenshot taken at save time |
| Reminders | ❌ | ✅ | ❌ |
| AI assistant, AI suggestions, MCP | ❌ | ✅ | ❌ |

## Data, platforms and privacy

| Feature | Raindrop Free | Raindrop Pro | Linemark |
|---|:-:|:-:|:-:|
| Import from browsers and HTML files | ✅ | ✅ | ✅ Imports Chrome's bookmark tree directly, plus HTML from any browser, Raindrop or Pocket |
| Export | ✅ | ✅ | ✅ Chrome-compatible HTML, plus a full JSON backup that includes screenshots |
| Backups | — | ✅ Daily, in the cloud | ◐ Manual, saved as a local file |
| Sync across devices | ✅ | ✅ | ◐ Optional and end-to-end encrypted, through your own Google Drive. Chromium browsers only for now; off by default |
| Apps (Mac, iOS, Android, other browsers) | ✅ | ✅ | ❌ Chrome only (Chromium browsers should work but haven't been tested) |
| Sharing and collaboration | ✅ | ✅ | ❌ |
| Integrations | ✅ 2,600+ | ✅ | ❌ |
| Account required | Yes | Yes | **No.** Sync uses your own Google account, only if you turn it on |
| Where your data lives | Raindrop's cloud | Raindrop's cloud | **Only in your browser profile (IndexedDB)** |
| Third-party services contacted | Raindrop | Raindrop | **None.** Linemark only reads the pages you save, and downloads each cover image once. Browsing the library never loads anything from the web |
| Price | Free | Paid subscription | Free |

## Gaps that fit Linemark's local-only approach

These are the remaining Raindrop features Linemark could add without a server. Broken-link checking and full-text search have since been built.

1. **Reminders:** use Chrome's built-in alarms and notifications.
2. **Highlights:** add a content script that stores highlights per page.
3. **Scheduled backups:** write a JSON file to Downloads on a timer.

Sync, sharing, collaboration and mobile apps need a server, so they are left out on purpose.
