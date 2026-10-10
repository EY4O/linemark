---
name: Linemark
description: A local-only bookmark manager drawn as a transit system, where every collection is a coloured line.
colors:
  brand: "#ff5a1f"
  brand-hover: "#ff6f3a"
  brand-ink: "#16171a"
  brand-text: "#c23c0b"
  brand-soft: "rgba(255, 90, 31, 0.13)"
  ink: "#16171a"
  ink-2: "#474a51"
  ink-3: "#686b73"
  ground: "#f2f2ef"
  surface: "#ffffff"
  surface-2: "#f7f7f5"
  hover: "#efefeb"
  rule: "#e3e3df"
  rule-strong: "#cdcdc7"
  on-color-rule: "rgba(0, 0, 0, 0.12)"
  band: "#16171a"
  band-ink: "#f4f3ef"
  band-ink-2: "#a8aab0"
  band-rule: "#2b2d32"
  band-hover: "#222429"
  band-active: "#2e3037"
  band-raised: "#3a3d45"
  band-danger: "#ff8a8a"
  band-ok: "#6fd18a"
  danger: "#c4282f"
  danger-soft: "rgba(196, 40, 47, 0.1)"
  warn-ink: "#8a5a00"
  warn-soft: "rgba(240, 168, 0, 0.17)"
  fav: "#f0a800"
  line-signal: "#d92a3a"
  line-magenta: "#c2255c"
  line-violet: "#7048e8"
  line-cobalt: "#2f5bd8"
  line-sky: "#1c8fd6"
  line-teal: "#0b7a75"
  line-green: "#2f9e44"
  line-olive: "#7d8a12"
  line-amber: "#f0a800"
  line-clay: "#9a5b36"
  line-slate: "#5c6773"
  line-rose: "#e0607e"
typography:
  month:
    fontFamily: "Archivo, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(5rem, 13cqw, 10.5rem)"
    fontWeight: 900
    lineHeight: 0.82
    letterSpacing: "-0.04em"
    fontVariation: "'wdth' 62"
  poster:
    fontFamily: "Archivo, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(4rem, 8vw, 6rem)"
    fontWeight: 800
    lineHeight: 0.92
    letterSpacing: "-0.035em"
    fontVariation: "'wdth' 78"
  display:
    fontFamily: "Archivo, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 760
    lineHeight: 1.08
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 85"
  headline:
    fontFamily: "Archivo, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 760
    lineHeight: 1.15
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 85"
  wordmark:
    fontFamily: "Archivo, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 760
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 87.5"
  section:
    fontFamily: "Archivo, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 740
    lineHeight: 1.2
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 85"
  title:
    fontFamily: "Archivo, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 720
    lineHeight: 1.3
    fontVariation: "'wdth' 87.5"
  cover-host:
    fontFamily: "Archivo, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(14px, calc(var(--card-w) * 0.073), 28px)"
    fontWeight: 760
    lineHeight: 1.1
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 80"
  card-title:
    fontFamily: "Archivo, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "14.5px"
    fontWeight: 650
    lineHeight: 1.32
  body:
    fontFamily: "Archivo, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  excerpt:
    fontFamily: "Archivo, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  meta:
    fontFamily: "Archivo, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
  label:
    fontFamily: "Archivo, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 650
    letterSpacing: "0.02em"
    fontVariation: "'wdth' 87.5"
  band-group:
    fontFamily: "Archivo, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 700
    letterSpacing: "0.08em"
    fontVariation: "'wdth' 87.5"
  chip-label:
    fontFamily: "Archivo, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 650
    fontFeature: "tnum"
    fontVariation: "'wdth' 87.5"
  micro:
    fontFamily: "Archivo, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 650
    letterSpacing: "0.02em"
    fontVariation: "'wdth' 87.5"
  fallback-letter:
    fontFamily: "Archivo, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 800
rounded:
  stem: "2px"
  xs: "4px"
  sm: "6px"
  segment: "8px"
  md: "10px"
  pill: "999px"
  bullet: "50%"
spacing:
  hairline: "1px"
  xs: "4px"
  sm: "6px"
  md: "10px"
  lg: "18px"
  gutter: "28px"
  gutter-narrow: "16px"
  section: "34px"
  touch-target: "44px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.brand-ink}"
    rounded: "{rounded.sm}"
    height: "34px"
    padding: "0 13px"
  button-primary-hover:
    backgroundColor: "{colors.brand-hover}"
  button-primary-station:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.brand-ink}"
    rounded: "{rounded.pill}"
    height: "38px"
    padding: "0 16px 0 12px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "34px"
    padding: "0 13px"
  button-secondary-hover:
    backgroundColor: "{colors.hover}"
  button-ghost:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    height: "34px"
    padding: "0 13px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "36px"
    padding: "8px 10px"
  field-error:
    textColor: "{colors.danger}"
    typography: "{typography.meta}"
  search:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "38px"
    padding: "0 64px 0 36px"
  segmented:
    backgroundColor: "{colors.hover}"
    rounded: "{rounded.segment}"
    padding: "2px"
  segmented-pressed:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "28px"
  stop:
    textColor: "{colors.band-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    height: "36px"
    padding: "0 10px"
  stop-hover:
    backgroundColor: "{colors.band-hover}"
  stop-current:
    backgroundColor: "{colors.band-active}"
    textColor: "{colors.band-ink}"
  tag-pill:
    backgroundColor: "{colors.band-hover}"
    textColor: "{colors.band-ink}"
    rounded: "{rounded.pill}"
    height: "26px"
    padding: "0 9px"
  tag-pill-selected:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.brand-ink}"
  scan-status:
    backgroundColor: "{colors.band-hover}"
    textColor: "{colors.band-ink}"
    rounded: "{rounded.md}"
    padding: "10px 6px 10px 12px"
  chip:
    backgroundColor: "{colors.hover}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    height: "24px"
    padding: "0 4px 0 8px"
  health-dead:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    typography: "{typography.chip-label}"
    rounded: "{rounded.pill}"
    height: "20px"
    padding: "0 7px 0 5px"
  health-warn:
    backgroundColor: "{colors.warn-soft}"
    textColor: "{colors.warn-ink}"
    typography: "{typography.chip-label}"
    rounded: "{rounded.pill}"
    height: "20px"
    padding: "0 7px 0 5px"
  health-moved:
    backgroundColor: "{colors.hover}"
    textColor: "{colors.ink-2}"
    typography: "{typography.chip-label}"
    rounded: "{rounded.pill}"
    height: "20px"
    padding: "0 7px 0 5px"
  snippet-label:
    backgroundColor: "{colors.hover}"
    textColor: "{colors.ink-3}"
    typography: "{typography.micro}"
    rounded: "{rounded.xs}"
    padding: "0 5px"
  snippet-mark:
    backgroundColor: "{colors.brand-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xs}"
    padding: "0 2px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "18px 15px 13px"
  station-sign:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.display}"
    padding: "20px 28px 18px"
  toast:
    backgroundColor: "{colors.band}"
    textColor: "{colors.band-ink}"
    rounded: "{rounded.pill}"
    height: "42px"
    padding: "6px 8px 6px 16px"
  bulk-bar:
    backgroundColor: "{colors.band}"
    textColor: "{colors.band-ink}"
    rounded: "{rounded.pill}"
    padding: "6px 6px 6px 16px"
---

# Design System: Linemark

## Overview

**Creative North Star: "Wayfinding Lines"**

Linemark is drawn as an International-style transit system for links. Every collection is a coloured line, every place in the library is a stop, and the screen always says which station you are standing at. A signage-black enamel band runs down the left edge carrying white, bold, semi-condensed labels; the work area beside it is a clean near-white ground where bookmark cards sit like posters on a platform wall. The line colours are the only saturation on screen; everything else is ink, paper and hairline.

The density is that of a working tool, not a showcase: 14px body, 36px rows in the band, hairline rules and tabular figures wherever a number appears. Depth is soft and functional (cards lift slightly under the pointer, popovers and the drawer float on a diffuse offset shadow). Motion is short and eased with a long-tail curve; its one ceremonial moment is the line-colour stripe that sweeps across the station sign on arrival. Under reduced motion nothing slides, scales or sweeps, but nothing freezes either: the stripe, drawer, bulk bar, menus and toasts fade in, so every state change is still seen.

The world explicitly refuses the category default of a grey sidebar, a blue accent and anonymous folder icons. Collections are never folders; they are round line bullets carrying a one- or two-letter code. The density holds for the mouse and opens up for the finger: coarse pointers get 44px targets without changing the layout's character.

**Key Characteristics:**
- A black signage band (sidebar) against a near-white work ground, in both themes.
- Solid round line bullets with 1–2 letter codes identify every collection, at every scale.
- Bullet fill encodes state: solid = filed, outline ring = Unsorted, dashed ring = Trash.
- Linemark orange belongs to the system, never to a user line.
- Archivo variable, bold and semi-condensed (width axis 80–87.5%) for every sign; normal width for reading text.
- Hairline rules, tabular figures, soft diffuse shadows.
- Status speaks in small tinted pills (dead, unverified, moved), never in line colours.

## Colors

Ink-and-paper neutrals carry the whole interface; saturation is spent only on line colours, the single system orange, and a small set of status tones.

### Primary
- **Linemark Orange** (orange): the system's own line. Used for the brand bullet, primary actions, focus rings, selection (selected cards, checkboxes, switches, range and progress fills, drop indicators, the selected tag pill in the band) and the All-bookmarks station stripe. Text on it is signage black (brand-ink), never white. Hover lightens to brand-hover.
- **Brand Text** (brand-text): the orange darkened for legibility when it must appear as text or a check mark on a light surface (menu checks). Lightened in dark theme (see the sidecar).
- **Brand Haze** (brand-soft): 13% orange used for the focus halo around fields, the text-selection highlight, and the highlight behind matched words in titles and full-text snippets.

### Secondary: the line palette
Twelve line colours, the only user-assignable hues: Signal (line-signal), Magenta, Violet, Cobalt, Sky, Teal, Green, Olive, Amber, Clay, Slate and Rose. Each paints a collection's bullet, its station-sign stripe, its sidebar stem, its placeholder cover and the popup's band stripe. Bullet lettering is chosen per colour by contrast: whichever of white or signage black reads better on that fill. Colour swatches carry a 1px on-color-rule inner hairline so pale fills keep an edge on white.

### Tertiary
- **Favourite Amber** (fav): the Favorites stop bullet, its station stripe, the filled favourite star on cards and the active favourite button in the card strip and popup. CSS and JS both read it from the one `--fav` token. It shares its value with the Amber line by design: favourites are told apart by shape (the star in the bullet and on the card), not by colour.
- **Signal Red** (danger): destructive actions (Remove, Delete forever, danger menu items), the Dead health chip, invalid field borders and messages, and the Broken links stop bullet and stripe. danger-soft is the hover wash and chip fill. Lightened in dark theme.
- **Warn Ochre** (warn-ink on warn-soft): the Unverified health chip only. A dark ochre on a 17% amber wash in light theme; a light gold on a 14% wash in dark.

### Neutral
- **Signage Black** (band / ink): the enamel band, toasts, the bulk bar and the drag ghost; also primary text on light surfaces. Dark theme deepens the band further.
- **Band Paper** (band-ink): white label text on the band. **Band Grey** (band-ink-2): counts, group headings and secondary icons on the band.
- **Band Hover / Band Active / Band Raised** (band-hover, band-active, band-raised): the three lifted tones of the band. Hover for pointer hover, tag pills and the scan-status panel; Active for the current stop, toast actions and the scan progress track; Raised for the toast action's hover and the band's scrollbar thumb.
- **Band Danger / Band OK** (band-danger, band-ok): status read on black. Band Danger is the bulk bar's Delete; Band OK is the popup's "saved" check.
- **Platform Ground** (ground): the work area behind cards and the sub-bar.
- **Poster White** (surface) and **Poster Grey** (surface-2): cards, sign, drawer, menus; surface-2 for cover wells, notes and the resting search field.
- **Ink 2 / Ink 3** (ink-2, ink-3): secondary text (excerpts, snippets, tags) and tertiary text (meta, placeholders, field labels, icons).
- **Hairline / Strong Hairline** (rule, rule-strong): dividers and card borders; field, button and chip outlines.
- **Overlays** (band-selection, brand-ink-soft, tile, cover-veil, cover-edge, knob, scrim, match-underline, shimmer): the alpha layers that sit over covers, photos or the page: text selection on the band, the selected tag pill's count, the white favicon tile, the checkbox veil and edge on covers, the switch knob, the drawer and sidebar scrim (deeper in dark theme), the search-match underline and the popup's loading shimmer. They are tokens like every other colour.

Dark theme keeps the same roles with re-tuned values (see the sidecar); the band stays black and Linemark Orange stays unchanged.

### Named Rules
**The System Line Rule.** Linemark Orange is the system's line and is never offered in the user palette. If a user could pick it, it would stop meaning "this is Linemark acting".

**The Only Saturation Rule.** Line colours are the only saturated colour on screen apart from the system orange, the favourite amber, danger red and the warn/ok status tones. Chrome, borders and tags stay neutral.

**The Distinct Lines Rule.** A new line takes the least-used colour first, and among equally used colours the one with the greatest hue distance from colours already in use. Neighbouring lines must never default to the same hue.

**The Neutral Tag Rule.** Tags are neutral ink (`#` in ink-3, name in ink-2 on cards; band-ink on the band). Tags are never line-coloured. A tag pill in the band fills with orange only while it is the selected filter, because that is selection, not colouring.

**The One Source Rule.** Every colour comes from a token, in CSS and in JS alike. Status tones on the band have their own band-* tokens rather than borrowing the light-surface values.

## Typography

**Display Font:** Archivo variable (self-hosted woff2, weight 100–900, width 62–125%), with Segoe UI Variable Text, Segoe UI, system-ui fallback
**Body Font:** the same Archivo at normal width

**Character:** One grotesk doing two jobs. Narrowed to 80–87.5% width and pushed to 700–800 weight, it is transit signage; at normal width and regular weight it is quiet reading text.

**Sizing:** every size is set in rem on the browser's root, so Chrome's default font-size setting scales the whole interface. The px values below are the sizes at the default 16px root (body is 0.875rem = 14px, a deliberate dense step for an operate surface). Text-bearing controls use minimum heights, never fixed ones, so larger text grows a control instead of clipping it. Bullet letters are the one exception: they scale with the bullet, not the root, because a bullet is a sign glyph.

### Hierarchy
- **Month** (Wrapped only; 900, `clamp(5rem, 13cqw, 10.5rem)`, 0.82, -0.04em, 62% width): the Journey's month name, set twice. The condensed black echo in rule-strong sits behind and is aria-hidden; over it the same name light and wide (220, 125% width, 0.62em, -0.02em) in ink is the h2.
- **Poster** (Wrapped only; 800, `clamp(4rem, 8vw, 6rem)`, 0.92, -0.035em, 78% width): the Summary count. The Journey's start and end year and stop count use it at 75% width, 0.95 and -0.03em.
- **Display** (760, 30px, 1.08, 85% width): the station name in the station sign. 22px under 860px.
- **Headline** (760, 26px, 1.15, 85% width): empty-state headings, balanced wrap.
- **Wordmark** (760, 22px, 1, 87.5% width): "Linemark" beside the brand bullet in the band.
- **Section** (740, 18px, 85% width): settings section headings, the popup line name and the popup empty-state heading. The drawer's title field also runs at 18px, but at reading width and 650.
- **Title** (720, 17px, 87.5% width): the drawer heading and in-content group headings.
- **Cover Host** (760, 80% width, 1.1): the host name on a placeholder cover. In the grid it scales with the card-size slider, `clamp(14px, card-w × 0.073, 28px)`; elsewhere 18px, and 14px in list view and under 860px. The favicon tile on the same cover scales as `clamp(30px, card-w × 0.15, 56px)` with its fallback letter at `clamp(14px, card-w × 0.07, 26px)`.
- **Card Title** (650, 14.5px, 1.32): bookmark titles, clamped to two lines. List view 15px on one line; moodboard 13.5px; headlines 14px at 560 on one line.
- **Body** (400, 14px, 1.45): base text, menu items, stop labels (540; current stop 650).
- **Excerpt** (400, 13px, 1.45, ink-2): card excerpts (two lines) and full-text snippets (three lines); long-form prose capped at 46–64ch.
- **Meta** (400, 12.5px, tabular figures): host, relative time, counts, field errors.
- **Label** (650, 12px, 0.02em, 87.5% width): form field labels in ink-3.
- **Band Group** (700, 11.5px, 0.08em, uppercase, 87.5% width): the group headings inside the band ("Lines", "Tags") only. They are navigation group names, not decoration above a headline.
- **Chip Label** (650, 11.5px, 87.5% width, tabular figures): health chips and the popup cover switch.
- **Micro** (650, 11px, 0.02em, 87.5% width): the "In page" snippet label; kbd hints (600) and tag-pill counts sit at the same 11px.
- **Fallback Letter** (800, 10px): the letter in a 16px favicon fallback square.

### Named Rules
**The Signage Width Rule.** Anything that names a place (station name, wordmark, bullet codes, headings, popup line name, cover host) uses the narrowed width (80–87.5%) at 700+ weight. Reading text never does.

**The Tabular Count Rule.** Every count, date and number uses tabular figures so columns of counts align, including the status codes in health chips.

**The On-Ramp Rule.** Sizes come from the ramp above; a new element takes the nearest step rather than a new size. The only fluid sizes are the cover clamps tied to the card-size slider, and Wrapped's Poster and Month steps.

## Layout

A two-column shell: the 268px signage band on the left, the work area filling the rest at full viewport height. The work area stacks the station sign (20/28px padding, 4px line-colour stripe along its bottom edge), a sub-bar on the ground colour (min 52px, hairline beneath) carrying the view switch, filters, size slider and sort, then the scrolling content area (24px top, 28px sides, 120px bottom clearance for the bulk bar).

The card grid auto-fills columns of minimum `--card-w` (260px default, driven live by the card-size slider) with 22px row and 18px column gaps. Covers are locked to one ratio (16:10) in cards and list; only the moodboard lets covers keep their natural height in CSS columns. List rows put a 172px cover at the left; headlines are 46px hairline-separated rows inside one bordered container. The Broken links view opens with a three-column legend (columns of min 240px, 10/28px gaps) above the grid.

The edit drawer is a 440px right sheet. The bulk bar and toasts float as pills centred on the work area, bottom 22px and 84px.

Below 860px the band becomes an off-canvas 280px sheet behind a menu toggle; it opens over the scrim and closes on any tap outside it. The station sign wraps (38px bullet, 24px name), labels collapse to icons, the size slider hides, cards fix at 150px, and gutters drop to 16px. The type filter drops to its own full-width row and scrolls sideways rather than widening the toolbar past the window.

**Touch.** On a coarse pointer every interactive target is at least 44px (icon buttons, buttons, stops, view segments, search, the primary pill, menu items); tag pills grow to 36px and selects to 40px, and inline targets such as card tags and chip remove buttons get an invisible padded hit area instead of a bigger look. With no hover, card actions collapse to one always-visible menu button (Favorite and Edit move into that menu), the selection checkbox stays visible at 32px, and the line "more" button sits inline in its row beside the count.

The popup is a fixed 380px column: a band header (min 66px) with a line-coloured bottom stripe, then a 136px thumbnail beside the editable title.

## Elevation & Depth

A hybrid: surfaces are flat with hairline borders at rest, and soft, diffuse, downward-offset shadows mark things that float or respond. Shadows are tinted with signage black, never coloured, and never hard-edged.

### Shadow Vocabulary
- **Rest** (`0 1px 2px rgba(22, 23, 26, 0.06)`): cards at rest, pressed view-switch segment, switch knob.
- **Lift** (`0 8px 18px -6px rgba(22, 23, 26, 0.16), 0 2px 4px rgba(22, 23, 26, 0.06)`): card hover (with a 2px rise), card action strip, drawer cover tools, placeholder favicon tile.
- **Float** (`0 24px 48px -16px rgba(22, 23, 26, 0.32), 0 4px 12px rgba(22, 23, 26, 0.08)`): menus, drawer, bulk bar, toasts, mobile band sheet.

Dark theme deepens all three (see the sidecar).

### Named Rules
**The Lift On Intent Rule.** Cards rise only under the pointer (`translateY(-2px)` plus Lift). List and headline rows never move, and under reduced motion no card moves; the shadow still changes.

## Shapes

One radius scale, nothing off it: 2px for track (sidebar stems, drop bars), 4px for small marks (favicons, kbd keys, the snippet label, highlight marks, the line twisty and options buttons, the rename field, the popup cover switch), 6px for controls (buttons, fields, menu items, stops, view segments, the list-view favicon tile, popup thumbnail), 8px for the segmented control's outer shell, and 10px for cards, tiles, menus, containers and the scan-status panel. Covers inside a 1px-bordered card use `--r-inner` (10px minus the border) so the image corner sits exactly inside the card corner. Full pills for things that travel, filter or report (search, station-level Add link, toasts, bulk bar, tag pills, chips, health chips, switches, progress bars), and perfect circles reserved for line bullets and colour swatches. Hairline borders (1px) define edges; the only heavier strokes are the 4px line stripes, the 3px sidebar stems, and bullet rings.

The line tree draws real track: child lines hang off a 3px stem in the parent's colour, with a 3px spur into each child stop. The first two levels indent 20px each; deeper levels step only 6px, so their stems run side by side as a bundle of colours (the path, read left to right), and past the eighth level indenting stops, so a name always keeps its room. A nested stop whose name is cut off, or that sits three or more levels deep, shows its full path ("This › Is › A › B") in a band-black tooltip beside the band on hover and on keyboard focus.

## Components

### Line Bullet (signature)
The atom of the system. A circle (default 22px) filled with the line colour, carrying a 1–2 letter code in 800 weight, 82% width, sized at 48% of the bullet (40% for two letters).
- **Solid:** a filed collection, or a system stop (All, Favorites with a star, Broken links with an alert mark, Tags).
- **Outline ring** (2px inset ring): Unsorted.
- **Dashed ring** (2px dashed): Trash.
- **On the cover edge:** each card's bullet rides the bottom edge of its cover, half over, with a 3px surface-coloured halo; it scales with the card-size slider, `clamp(18px, card-w × 0.092, 32px)`, alongside the placeholder lettering. In list view it rides the cover's right edge at 22px.
- Sizes in use: 14 (path), 16 (headlines), 18 (toast, pickers), 20 (stop), 22 (drawer, settings headings), 30 (brand), 34 (popup), 38–46 (station sign), 40 (empty state).

**Bullet faces.** A bullet shows one of three faces, always on the line's colour disc:
- **Letters:** the one- or two-letter code, the default.
- **Icon:** one of 240 bundled Lucide icons, drawn at 60% of the bullet with a 2.4 stroke so it holds up at 14px.
- **Emoji:** at 60% of the bullet.

The ink colour still comes from `bulletInk`. The picker is a menu, not a modal: a search field, an 8-column grid of 20px icons (keyboard: arrow keys move in two dimensions), and an emoji field. The selected icon is marked with the brand-soft fill and a 1.5px brand ring.

### Station Sign (signature)
The header of the work area: a 46px bullet, the station name in Display, a count in Meta with the number in ink, and a 4px stripe in the line colour along its bottom edge that sweeps in from the left on arrival (0.6s; a 0.3s fade under reduced motion). The parent path (small bullets, chevron separators, each a link) renders above the name only when the place has a parent: child lines, and Broken links, which lives under Settings. Top-level lines and the other system stops show no text above the name.

### Signage Band / Stops
- **Stop:** 36px row, 20px bullet, band-ink label, tabular count in band-ink-2; hover lifts to band-hover.
- **Line row:** a row holding real controls side by side: a twisty button (aria-expanded) for lines with children, the stop link whose hit area fills the whole row, the count, and a "more" options button that replaces the count on hover or focus. Keyboard focus on the link rings the whole row. F2 on a line row renames it in place (a 26px ember-bordered field on band black).
- **Current stop:** band-active fill, 650 weight, and a ring around the bullet (2px band-active gap, 2px line-colour ring). Marked for assistive tech with aria-current. There is no side tab or edge bar.
- **Broken links stop:** a solid danger-red bullet with a white alert mark, directly under Favorites. It exists only while at least one link is dead, moved or unverified.
- **Drag targets:** a 1px inset ring in the line colour for drop-into; a 2px orange bar for drop-before/after.
- **Tag pills:** 26px pills on band-hover with a tabular count; the selected tag fills orange with signage-black text.
- **Scan status:** while links are being checked or indexed, a 10px-radius band-hover panel sits above the band foot with a bold status line, a tabular count, a cancel icon button and a progress bar on a band-active track. It is a live status region.

### Buttons
- **Shape:** gently rounded (6px), 34px tall; small variant 28px.
- **Primary:** orange fill, signage-black text at 680 weight. In the station sign it becomes a 38px pill with a leading plus icon.
- **Secondary:** surface fill, strong-hairline border, 560 weight; hover to the hover tone; press nudges down 1px (no nudge under reduced motion).
- **Ghost:** transparent, ink-2 text; hover gains the hover tone.
- **Danger:** danger text; hover gains danger-soft fill and danger border. On the band (bulk bar) danger reads in band-danger.
- **Icon button:** 32px (26px small) transparent square, ink-2 icon.
- **Focus:** 2px orange outline, 2px offset, everywhere.

### Chips
- **Tag chip (editor):** 24px pill, hover-tone fill, ink-2 text, round remove button.
- **Filter chip:** 28px pill, surface fill, strong-hairline border.
- **Health chip:** a 20px pill in Chip Label type with a 13px icon, the state word and the HTTP code where known. Dead: danger on danger-soft, alert icon. Unverified: warn-ink on warn-soft, alert icon. Moved: ink-2 on the hover tone, move icon. It sits at the end of a card's meta row, after the favourite star.
- **View switch:** segmented control on the hover tone with an 8px shell; the pressed segment becomes a 6px surface tile with Rest shadow and hairline ring.

### Cards / Containers
- **Corner Style:** 10px; covers clip to the top corners.
- **Background:** surface, with a hairline border.
- **Shadow Strategy:** Rest, Lift on hover (see Elevation).
- **Cover:** 16:10, screenshots anchored top-centre; with no image, a placeholder in the line colour carrying a white favicon tile and the host name in Cover Host type.
- **Internal Padding:** 18px top (clearing the cover bullet), 15px sides, 13px bottom; 6px internal gap.
- **Full-text match:** when a search matches page text, the excerpt is replaced by a three-line snippet led by a small "In page" label (Micro type, ink-3 on the hover tone, 4px radius); matched words in the snippet and title get an brand-soft highlight with a 2px orange underline.
- **Selected:** 2px orange ring plus Lift; the corner checkbox fills orange.
- **Actions:** a floating surface strip of icon buttons at top-right, appearing on hover or focus. On touch it is a single always-visible menu button.

**Covers are local.** A cover is a stored screenshot or a page image downloaded once; the library never loads an image from the web. A cover that still points at a website renders the line-coloured placeholder until it is stored.

### Inputs / Fields
- **Style:** 36px, surface fill, strong-hairline border, 6px radius; hover darkens the border to ink-3.
- **Focus:** orange border plus a 3px brand-soft halo; caret is orange.
- **Error:** the field turns its border danger (aria-invalid) and an inline message appears beneath in Meta size and danger colour, announced as an alert and linked by aria-describedby. The message slot takes no space while empty.
- **Search:** 38px pill on surface-2 with a leading search icon and a `/` key hint; turns surface on focus.
- **Line picker:** a field-shaped button showing the chosen line's bullet and name.

### Broken links legend
A definition list above the Broken links grid: one column per state, each a health chip over a one-sentence plain-language meaning in 13px ink-2 (Dead, Moved, Unverified), with the next action named in bold where there is one.

### Navigation feedback: Toasts and Bulk Bar
Both are signage-black pills with Float shadow, reading as fragments of the band. Toast actions are band-active pills with orange text, raising to band-raised on hover. The bulk bar shows a tabular count, transparent band-ink buttons and band-rule separators, and slides up from below (fades in under reduced motion).

### Drawer
A 440px right sheet on surface with Float shadow and a 0.32s slide (a 0.2s fade under reduced motion); header with title, auto-save indicator and close; body stacks the cover, title field, URL row, line picker, tags, note, toggles and metadata at 16px gaps. It is a modal dialog: while open, the app behind it is inert and the scrim catches outside clicks. Focus moves to the title field on open and returns to the edited card's title on close.

### Menus and focus
Menus open with a short pop (fade under reduced motion), take arrow-key focus, and hand focus back to the control that opened them when they close. Re-rendering the grid never drops the keyboard: focus returns to the same card and the same control on it.

### Sync (optional)
Sync lives in its own Settings section, after "Take links out", with an "Optional" pill beside the heading. It's off by default, and nothing about sync appears anywhere else until it's turned on.

- **Setup:** an inline form, not a modal. It has the client ID field with the redirect URI in a copyable code chip, the passphrase and its confirmation, and inline errors that use `.field-error` and `aria-invalid`.
- **Sync on:** a status row ("Synced 2m ago"), a row for this device's key, and a "Turn off sync" row. "Delete cloud copy" is a danger button with two-step confirmation.
- **Status in the band:** a cloud icon button sits in the brand row, beside Add link, and links to Settings. A 7px dot on it reports the state: band-ok when up to date, fav amber when locked or needing attention, Linemark orange (pulsing) while syncing. Its accessible name spells out the state.

### Popup
A compact band header: line bullet (34px), a status sentence ("Saved to" with a band-ok check, or "Already saved") over the line name as a picker, favourite and open-in-manager icon buttons, and a 4px stripe in the line colour (band-ink-2 grey for Unsorted). Below on surface: thumbnail with a Page / Screen / None cover switch, the editable title, host, tags, note, and a Remove / Done footer.

### Network map
The fifth view draws the listed links as a transit map. The left column is the sidebar's tree: 24px line bullets (letters on the line colour), branches joined to their parent by a 4px stem in the parent's colour that elbows into the child. Each line runs right as a 7px track in its colour; its links are 8px stations (surface fill, 4px ring in the line colour) labelled at -30° in 12.5px ink-2, cut at 22 characters. A link that stops on more than one line is an interchange: a 9px station with an ink ring, drawn on every line it serves. Up to 14 stations per line, then "+N more" to the line. The map scrolls sideways inside its own frame.

### Linemark Wrapped
Settings → Library → Linemark Wrapped, with a **Summary | Journey** switch (a `.seg`, remembered).
- **Summary:** a count in Poster (`clamp(4rem, 8vw, 6rem)` at 800, 78% width), a year line of twelve month stations sized by saves (busiest filled orange, quiet months grey), and plain cards: surface, 1px rule border, 10px radius, no stripe. **Save as image** draws a 1080×1350 PNG on the signage-black band, whatever the theme.
- **Journey:** the year as one ride, scrolling sideways in its own frame. Each month is said twice in Month: a condensed black name (900, 62% width) in rule-strong behind, drifting with the scroll and aria-hidden, and the same name light and wide (220, 125% width) in ink over it, which is the h2. The month's save count sits under the name. Each page saved is a stop: its cover (greyed until reached), title, and line path. A dotted ink-3 line runs level and takes changes in height on 45° diagonals, metro style; a white dot rides it at 36% across (16% on phones), filling the line behind it in each stop's line colour. A HUD names the month, the line and the count ridden. The track's heights are calc() with rem, so larger text grows the ride instead of overlapping it. Covers load only as they come within about 1200px of the view. Riding is native sideways scrolling: trackpad, Shift+wheel, the scrollbar, or arrow keys with the region focused; a plain vertical wheel scrolls the page. These poster sizes belong to Wrapped only; the app keeps the ramp above.

### Interchanges, departures, smart lines
- **Interchange:** a card shows its further lines as extra cover bullets, overlapping the main bullet to the right (as a transfer station's joined bullets); headlines show them as overlapped small bullets.
- **Departures:** a system stop in band paper (a clock on a band-ink disc) that appears only while something is due (the Conditional Stop Rule). Cards carry a revisit chip: a quiet hover-fill pill, ink-filled when due.
- **Smart lines:** a line whose bullet face is a filter, holding no links; its station sign shows its search in a pill beside the count. Smart lines never appear in pickers and never accept dropped links.
- **Suggestions:** on-device AI results are dashed-outline chips (solid orange outline on hover) in a surface-2 box; each applies on click.

### The network in operation (motion)
All motion has a fade for reduced motion.
- **Board flip:** a count that changes (sidebar, station sign) flips over like a split-flap board (0.45s).
- **Track draw:** a new line or branch slides onto the band and draws its spur from the stem.
- **Direction of travel:** moving to a stop lower in the sidebar brings the first twelve cards up from below; moving up brings them down, staggered 25ms.
- **Filing:** dropping links on a line sends a dot in their line colour from the drop to that line's bullet, which takes it in with a small pulse.
- **The checker as a train:** a band-paper dot rides the front of the progress bar; when a dead link is found, the Broken links bullet sounds one red ring.
- **Popup arrival:** on a new save, a train runs in along the header stripe and stops under the bullet before "Saved to" shows.
- **Moving between stations:** a View Transition crossfades the content (0.22s) while the band stays put; arriving at a station flips its name in letter by letter, split-flap style.
- **Tactile controls:** buttons press in under the pointer with the `--press` inset shadow.
- **Map trains:** on the network map a dot runs each line with more than one station; stations saved in the last day pulse.
- **Station chime:** an optional two-note Web Audio tone on saves from the popup or the library (Settings → Appearance), off by default; no sound files. Right-click saves run in the service worker, which has no audio, so they stay quiet.
- `--band-brand` (#ff8a5c) is Linemark orange lifted for text on the band (toast actions): 4.7:1 or better on every band tone.

### Public site (docs/)
The homepage and privacy page are a Persuade surface in the same world, not a second system: same tokens, Archivo, bullets, hairlines and shadows, with a larger type scale for reading at a distance. These sizes apply to docs/ only; the app keeps the ramp above.
- **Type:** hero h1 `clamp(3rem, 6.2vw, 5.75rem)` at 780, 80% width, 0.96 leading, -0.03em; stop h2 `clamp(2rem, 3.6vw, 3rem)` at 770, 82% width; terminus h2 `clamp(2.5rem, 5vw, 4.25rem)` at 780, 80% width; ledes 1.25rem (hero) and 1.1875rem (stops) in ink-2, 48–58ch; body 1rem at 1.55.
- **Route:** the band carries the page's stops on a 5px orange trunk. Each stop is an interchange: a 24px band-black dot with a 5px border in that section's line colour (Save teal, Find cobalt, Private green; Try it and Install orange). Branch stops (Keep links healthy off Find, Your Google account off Private) sit 22px in, joined by a rounded L stem in the parent's colour, as sub-lines are in the app; their row fill starts right of the trunk so it never covers it. The current stop is marked by a solid disc in its line colour, ringed band-ink, that rides to it as you scroll.
- **The route draws itself:** the trunk is laid in band-rule grey and fills orange behind the current-stop disc as you read; stops ahead keep their rings dimmed (38% of their colour) and branch stems dim until reached. Stop rules draw across as each stop scrolls in, and on phones the trunk and stems draw down (CSS scroll timelines; fully drawn where unsupported or under reduced motion).
- **The scene:** on screens 1180px and wider, the station sign's right half carries a small 3D network in raw WebGL (hero.js, no libraries): the six line colours as raised tracks, white stations with a signage-black rim, two branches, trains easing between termini, a faint dot grid, and a slow drifting camera that leans toward the pointer. It fades in from the left, pauses off screen and in background tabs, and is a still picture under reduced motion.
- **Stop headings:** a station sign: a 30px ring (6px border in the line colour), the h2, and a 4px rule in the line colour under the head. Branch stops show the parent path above the name (12px parent bullet, its name as a link, a chevron), the app's path pattern; top-level stops show nothing above the name. Under 880px the band collapses to a top bar; the orange trunk runs down the left edge through every stop, and each branch leaves its parent on a 5px stem in the parent's colour, elbowing into its indented ring.
- **Touch:** on coarse pointers and under 880px every control is at least 44px tall (line buttons, suggestion chips, card titles, path links, footer links).
- **Permission panel:** the Google-scope panel is a band-black block (10px radius, 24/26px padding) with a full-width 5px orange stripe along its bottom edge; the terminus uses the same band block with a 10px line-colour stripe.
- **Buttons:** 46px pills (700 weight); primary orange with signage-black ink, secondary surface with a strong hairline.

### Named Rules
**The Conditional Stop Rule.** A system stop that reports a problem (Broken links) appears only while the problem exists. An empty problem stop is noise.

**The Focus Stays Put Rule.** Whatever re-renders or closes (grid, drawer, menu), keyboard focus lands back on the thing the person was working with, never on the page body.

**The Fade Not Freeze Rule.** Reduced motion swaps movement for opacity; it never removes the transition outright.

## Do's and Don'ts

### Do:
- **Do** give every collection a round line bullet with a 1–2 letter code, and render it at every scale it appears (stop, path, card edge, station sign, toast, popup).
- **Do** encode bullet state by fill: solid for filed, outline ring for Unsorted, dashed ring for Trash.
- **Do** reserve Linemark Orange (#ff5a1f) for the brand bullet, primary actions, focus, selection and the All-bookmarks stripe.
- **Do** assign new line colours least-used first, then by greatest hue distance from colours in use.
- **Do** mark the current stop with the band-active fill plus a ring around its bullet.
- **Do** set every place name in bold, narrowed Archivo (80–87.5% width) and every number in tabular figures.
- **Do** keep covers at one locked ratio (16:10) everywhere except the moodboard.
- **Do** edit in the right-hand drawer sheet, treated as a modal dialog (app inert, focus returned to the card on close).
- **Do** take every colour from a token, in CSS and JS; favourites read `--fav`, status on the band reads the band-* tokens.
- **Do** keep radii on the scale: 2, 4, 6, 8, 10px, pill, circle.
- **Do** give coarse pointers 44px targets and keep card actions reachable without hover.
- **Do** turn slides, scales and sweeps into fades under reduced motion.

### Don't:
- **Don't** put Linemark Orange in the user line palette or use it for a collection.
- **Don't** colour tags; they are neutral ink, never line-coloured, and orange only while selected.
- **Don't** tell favourites apart by colour alone; the favourite amber equals the Amber line, so the star shape carries the meaning.
- **Don't** mark the current stop with a side tab or edge bar.
- **Don't** put a kicker or eyebrow above the station name; the path appears only for places that have a parent.
- **Don't** use a grey sidebar, a blue default accent, or folder icons for collections.
- **Don't** set white text on Linemark Orange; its ink is signage black.
- **Don't** show the Broken links stop when nothing is broken.
- **Don't** load remote fonts or icon sets; Archivo is self-hosted and icons are the authored 24px, 1.75-stroke set.
