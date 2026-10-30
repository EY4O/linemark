# Microsoft Edge Add-ons listing: Linemark

The same extension as the Chrome Web Store item (see `store/LISTING.md`), listed at [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons). Registering and submitting are free. Certification takes up to seven business days.

Build the packages with `node tools/package.mjs` and upload `dist/edge-<version>.zip`: the same files and version as Chrome's `dist/chrome-<version>.zip`. Text in the extension that names the browser ("Import Edge favorites", "Edge's built-in AI", "this Edge profile") follows the browser it runs in (`M.BROWSER` in `js/model.js`).

---

## Before you submit

1. **Developer account.** Register at [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/public/login?ref=dd) with a personal Microsoft account (not a work or school one), or sign in with GitHub, which makes one for you. There is no fee.
2. **Upload the package first** (Partner Center → Edge → **Create new extension** → drop the zip). The **Extension overview** page then shows the extension's ID, which Edge gives the extension and which differs from Chrome's.
3. **Let Google sign-in work in Edge.** In the Linemark Cloud project (Google Auth Platform → **Clients** → the Web application client, `1037985269779-654f8q…`), add an authorised redirect URI for the Edge ID:
   `https://<edge-extension-id>.chromiumapp.org/google`
   Edge uses Google's sign-in window with this client (`js/config.js` → `GOOGLE_WEB_CLIENT_ID`). Chrome's entry, `https://laapaiiaipeoilipnbhpjmjbdkomhjln.chromiumapp.org/google`, stays as it is. Both browsers share one Cloud project, so they sync the same library.
4. **Publish the Google sign-in app** (Google Auth Platform → **Audience** → **Publish app**) if it's still in Testing; otherwise only the test users can turn on sync, in Edge or Chrome.

---

## Availability

- **Visibility:** Public (or Hidden: reachable only by its link, like Chrome's Unlisted).
- **Markets:** all.

## Properties

- **Category:** Productivity
- **Website:** `https://linemark.eternalpose.io/`
- **Support contact:** `https://github.com/EY4O/linemark/issues` (or iamlooneth@gmail.com)
- **Mature content:** no

## Privacy

**Single purpose:**
> Save, organise and find bookmarks locally in the browser, with optional end-to-end encrypted sync to the user's own Google Drive.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `unlimitedStorage` | Stores the bookmark library locally in the browser profile (IndexedDB). It includes cover images and page text for search; without this, the browser could evict large libraries. |
| `activeTab` | When the user clicks the toolbar button, shortcut or context menu, Linemark reads that tab's title, address and description and takes a screenshot to save it. |
| `scripting` | Runs a one-off read of the page the user chose to save (title, description, cover image and readable text). It runs only on that tab, at the user's request. |
| `contextMenus` | Adds "Save page to Linemark", "Save link to Linemark", "Save highlight to Linemark" (on selected text) and "Save image to Linemark" (on an image) to the right-click menu. |
| `bookmarks` | Lets the user import their existing Edge favorites into Linemark (read only). |
| `favicon` | Shows site icons from the browser's local favicon cache, so no third-party icon service is needed. |
| `tabs` (optional) | Requested only when the user chooses "Save all open tabs" or "Save tab groups as lines", to read the addresses and titles of the window's tabs. |
| `tabGroups` (optional) | Requested only when the user opens a line as a tab group (to title and colour the group) or saves their tab groups as lines (to read each group's title and colour). |
| `identity` (optional) | Requested only when the user turns on sync, to sign in to Google (Drive app-data scope only). |
| Host permission `<all_urls>` (optional) | Requested only when the user runs a link check, fetches previews, indexes page text, or refreshes a bookmark. Linemark then requests the user's own saved pages directly from their websites. When the user chooses "Find archived copy" on a dead link, it asks archive.org for that one link. |

**Are you using remote code?** No, I am not using remote code. All scripts, fonts and icons are packaged with the extension.

**Data usage.** Tick the categories that match these (Partner Center's names may differ slightly from Chrome's). The data stays on the user's device, or, with optional sync, goes encrypted to the user's own Google Drive. It is never sent to the developer.
- **Web history / browsing activity:** the addresses of pages the user chooses to bookmark.
- **Website content:** titles, descriptions, cover images, screenshots and readable text of pages the user saves.
- **Authentication information:** only with optional sync, a short-lived Google access token kept on the device.
- Nothing else (identity, health, financial, communications, location, user activity).

Certify each disclosure statement (no selling or transferring data, no use unrelated to the single purpose, no creditworthiness or lending).

**Privacy policy URL:** `https://linemark.eternalpose.io/privacy.html` (it covers Chrome and Edge).

## Store listing (English)

The **Extension name** and **Short description** come from the manifest:
- Name: `Linemark — Bookmark Manager`
- Short description: `Bookmarks on colour-coded lines, with tags, notes, full-text search and a broken-link checker. Local by default; sync optional.`

**Description** (plain text, 250 to 10,000 characters; this is about 2,000):

```
A bookmark manager drawn like a transit map.

Every collection is a coloured line and every link a stop, with full-text search and a broken-link checker. Local by default; sync optional.

Save in one gesture
Save any page from the toolbar, the right-click menu or Alt+Shift+S, with its title, description and cover.
Right-click selected text to keep it as a highlight, or an image to save it, stored with the page it came from.
Save a whole window of tabs, or bring in your Edge favorites in one click.

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
Optional suggestions for a line, tags and a summary from the browser's built-in AI where it's available, worked out on your computer.

Private by default
No account, no server, no tracking. Your library stays in your browser.
Optional sync through your own Google Drive, encrypted on your device with AES-256 before it leaves. It keeps Edge and Chrome in step.
Export to HTML or a full JSON backup at any time.
```

**Images** (the Chrome images, plus a larger logo):

| Field | File | Size |
|---|---|---|
| Extension logo (required) | `store/edge/logo-300.png` | 300×300 |
| Small promotional tile | `store/images/promo-small.png` | 440×280 |
| Large promotional tile | `store/images/promo-marquee.png` | 1400×560 |
| Screenshots (up to 6) | `store/images/screenshot-1.png` … `screenshot-5.png` | 1280×800 |

**Search terms** (at most 7 terms of up to 30 characters, 21 words in all; these use 14):
`bookmark manager` · `bookmarks` · `favorites manager` · `read later` · `tab groups` · `full text search` · `broken links`

## Notes for certification

```
Linemark needs no account. To test: click the toolbar button on any web page to save it (it goes to Unsorted), then open the library from the popup's open-library button or Alt+Shift+L. Right-click a page, link, selected text or image for the Save to Linemark items. In the library: make a line with + next to Lines, drag cards onto it, search, and switch views (cards, list, headlines, moodboard, map).

Optional features ask for permission only when used: Settings > Health & search (link check, page text; asks for site access), Save all open tabs / tab groups (asks for tabs and tabGroups), and Sync (asks for identity, then Google sign-in for Drive app-data storage only; testers can leave sync off). Suggestions appear only where the browser offers built-in AI.

No data is sent to the developer; there is no server.
```
