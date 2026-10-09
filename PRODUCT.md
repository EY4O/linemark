# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Chrome extension, Manifest V3. Plain HTML/CSS/JavaScript (ES modules), no build step: the folder loads directly via `chrome://extensions` → "Load unpacked". Data lives in the extension's IndexedDB; small preferences in `chrome.storage.local`.

## Users

A single person managing their own web bookmarks in Chrome — saving pages while browsing, then later finding, organizing, and revisiting them from a dedicated manager tab.

## Product Purpose

Linemark is a local-only bookmark manager in the spirit of raindrop.io: collections, tags, notes, rich previews, fast search and multiple views — without an account, a server, or a subscription. Success means saving is one click and finding something again takes seconds.

## Positioning

Raindrop-class organization that is local by default. Out of the box nothing leaves the machine: the only network traffic is reading the pages you bookmark (and downloading each page's cover image once, to store it locally), and the library itself never loads anything from the web. Sync across devices is an option, never a requirement: when you turn it on, everything is encrypted on your device with your passphrase before it reaches storage you own (your Google Drive's private app folder), so the storage provider only ever holds ciphertext.

## Operating Context

- Saving happens mid-browse: toolbar popup, right-click menu, keyboard shortcut.
- Finding happens in the full-page manager or straight from the address bar (omnibox keyword).
- Chrome's own bookmarks are the on-ramp: one-click import of the bookmark tree (folders → collections). Netscape HTML import/export for portability. Linemark is the source of truth after import — no live two-way sync.

## Capabilities and Constraints

- Collections (nested), tags, favorites, notes, trash with restore.
- Views: list, cards, headlines (compact), moodboard.
- Previews: screenshot of the tab at save time, plus the page's own title/description/cover image. Imported bookmarks may optionally fetch metadata directly from each site (requires an opt-in host permission). Favicons from Chrome's local favicon cache.
- Full JSON backup/restore; HTML export Chrome can import.
- No Linemark account, no Linemark server, no analytics, no remote fonts or scripts.
- Optional sync (off by default): end-to-end encrypted with a passphrase-derived key (PBKDF2-SHA256 → AES-256-GCM), stored in the user's own Google Drive app-data folder. Every feature works identically with sync off. Losing the passphrase loses only the cloud copy; local data is unaffected.

## Brand Commitments

Name: **Linemark** (formerly Ember). Collections are *lines*; the name is literal: a bookmark on a line.

## Product Principles

1. Local by default — every feature works with sync off and no third-party services. Sync is an opt-in extra: end-to-end encrypted, only to storage the user owns, and never required.
2. Saving is one gesture; organizing can happen later (Unsorted is a first-class place).
3. Finding beats filing — search, tags and filters must be instant.
4. Never lose data — trash before delete, backups are one click.
