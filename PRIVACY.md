# Linemark privacy policy

**Effective date:** 9 October 2026

Linemark is a bookmark manager for Chrome and other Chromium browsers. It is **local by default**: your library lives on your own computer, and the developer of Linemark never receives any of your data.

## In short

- Your bookmarks, notes, tags, covers and page text are stored **in your browser profile**, on your device.
- Linemark has **no server, no analytics, no ads and no tracking**. The developer collects nothing.
- Linemark only contacts websites **when you ask it to**: to save a page, check links, fetch previews or index page text.
- **Sync is optional and off by default.** If you turn it on, your library is **encrypted on your device** with your passphrase before it goes to **your own Google Drive**. Google stores only encrypted data, and the developer never receives it.

## What Linemark stores, and where

Everything below is kept in Linemark's storage inside your Chrome profile (IndexedDB and extension storage) on your device:

- **Bookmarks:** web addresses, titles, descriptions, your notes and tags, favorites, and which line (collection) each one belongs to.
- **Cover images:** a screenshot of the page you saved, or the page's own cover image, downloaded once.
- **Page text:** the readable text of saved pages, used for full-text search.
- **Link status:** whether each link still works, from link checks you run.
- **Settings:** your preferences. If you turn on sync, also your sync settings, a short-lived Google access token, and your encryption key.

The encryption key is stored so that it can be used on this device but not read back out (a non-extractable key). Your passphrase itself is never stored.

## When Linemark uses the network

Linemark makes network requests only for the features below, and only when you use them.

| Feature | What happens |
|---|---|
| **Saving a page** (toolbar button, right-click menu or shortcut) | Linemark reads the open tab's title, description, cover-image address and readable text, and takes a screenshot of the visible tab. All of this happens on your device. If the page names a cover image, Linemark downloads that image once from the site that hosts it and stores it locally. |
| **Link checks, previews, full-text indexing, Refresh** (optional; Chrome asks for site access first) | Linemark requests each saved page directly from its own website, much as your browser does when you visit it. Your cookies aren't sent. The website sees an ordinary request from your browser, including your IP address. |
| **Optional sync** | See *Optional encrypted sync* below. |
| **Site icons** | Linemark uses Chrome's own local cache of site icons. No icon service is contacted. |

The library itself never loads anything from the web while you browse it. Fonts, icons and covers all come from the extension or from your local storage.

## Optional encrypted sync

Sync keeps your library the same across your own computers. It is off unless you turn it on in **Settings → Sync**.

- **Sign-in:** you sign in with your Google account, either through Chrome's own sign-in or Google's sign-in window. Google's privacy policy applies to that sign-in. Linemark asks for one permission only: `drive.appdata`, which gives access to a private app folder in your Google Drive. Linemark can't see or change any of your other Drive files.
- **Encryption:** before anything leaves your device, your passphrase is turned into an encryption key (PBKDF2-SHA256 with 600,000 iterations, then AES-256-GCM). Your library and images are encrypted with that key on your device. **Google stores only encrypted data**, and without your passphrase no one, including Google or the developer, can read it.
- **What syncs:** lines, bookmarks, notes, tags, deletions and stored images. Page text for search isn't synced; each device rebuilds its own.
- **The developer receives nothing.** Data travels only between your device and your own Google Drive.
- **If you lose your passphrase,** the encrypted cloud copy can't be recovered. Your local library is not affected.

### Google API Services: Limited Use

Linemark's use and transfer of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

Specifically, Linemark:
- uses Google Drive's app-data folder only to store and retrieve your own encrypted library;
- does not transfer that data to anyone, does not use it for advertising, and does not allow humans to read it;
- never has access to the unencrypted contents, because encryption happens on your device.

## What the developer collects

**Nothing.** Linemark has no server and no analytics, crash-reporting or advertising code. Your data is not sold or transferred to anyone, and it is not used for any purpose other than the features described here. The use of information in Linemark complies with the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), including its Limited Use requirements.

## Permissions

| Permission | Why |
|---|---|
| `storage`, `unlimitedStorage` | Keep your library, covers and page text on your device |
| `activeTab`, `scripting` | Read the page you choose to save (title, description, cover, text) and take its screenshot |
| `contextMenus` | **Save page / Save link to Linemark** in the right-click menu |
| `bookmarks` | Import Chrome's bookmarks when you ask (read only) |
| `favicon` | Show site icons from Chrome's own cache |
| `tabs` (optional) | **Save all open tabs**, only when you use it |
| Access to websites (optional) | Link checks, previews, full-text indexing and Refresh, only when you turn them on |
| `identity` (optional) | Sign in to Google for optional sync, only when you set it up |

## Your control

- **Delete** any bookmark or line at any time. Trash keeps items until you empty it.
- **Export** your library whenever you like, as Chrome-compatible HTML or a full JSON backup.
- **Uninstall** Linemark to remove all of its local data. Chrome deletes the extension's storage.
- **Sync:**
  - **Turn off** stops syncing on a device.
  - **Delete cloud copy** removes every Linemark file from your Drive.
  - You can also remove Linemark's access to your Google account at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
- **Site access:** revoke it in **Settings → Health & search**, or on Chrome's extension page.

## Children

Linemark isn't directed at children under 13 and doesn't knowingly handle their personal information. In any case, all data stays on the user's device or in their own Google Drive.

## Changes to this policy

If this policy changes, the effective date above will change too. Material changes will also be noted in the extension's release notes.

## Contact

Questions about privacy: **[iamlooneth@gmail.com](mailto:iamlooneth@gmail.com)**
