---
version: 1
slug: "app-html"
primary_target: "app.html"
related_targets: ["popup.html"]
---

# Ember manager (app.html) + quick-save popup

Scope: the full-page manager tab and the toolbar popup. Mode: Operate.

Audience/job: one person saving links mid-browse, then finding, filtering and filing them from a dedicated tab. Frequent, short visits; thousands of bookmarks must stay fast. Important states: empty library (first run → import from Chrome), Unsorted backlog, empty search result, Trash, drag-to-file, bulk selection.

Constraints: no remote fonts/scripts; MV3 CSP; works with chrome.* APIs absent (plain-page preview).

Scene: a desk in Chrome, daylight and evening lamp, flicking between mostly-white web pages → light work area by default, dark theme following the system.

## Direction contract

THESIS: Ember is a transit system for links: every collection is a coloured line, and the screen always says where you are. It refuses the category default of a grey sidebar, blue accent and anonymous folder icons.

OWN-WORLD: a signage-black enamel sidebar band with white bold semi-condensed grotesk labels (self-hosted Archivo variable, wdth axis); a clean near-white work ground; line colours are the only saturation; collections are solid round line bullets carrying a 1–2 letter code; Ember orange is the system's own line (primary action, focus, selection). State by fill: solid = filed, outline ring = Unsorted, dashed ring = Trash. Hairline rules, tabular figures, soft offset shadows.

STORY: the visitor sees their links grouped by line, knows exactly which station they are at, and saves, searches, tags, drags-to-file and restores without hunting.

FIRST VIEWPORT: left 264px black band: wordmark, search, system stops (All, Unsorted, Favorites, Trash), Lines with bullets and counts, Tags. Top of work area: station sign (large bullet, collection name ~30px bold semi-condensed, path, count) with search, view switch (List / Cards / Headlines / Moodboard), sort, card-size slider, primary “Add link”. Below: the bookmark grid, covers locked to one ratio, each card carrying its line bullet. Edit opens a right drawer, not a modal. Signature move: line bullets riding each cover's edge (rescaled live, with the cover lettering, by the one card-size control) and the station sign whose line-colour stripe sweeps in on arrival.

FORM: Wayfinding Lines (International-style transit signage), position 5 on the ordered list, seed key 0575f109.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
