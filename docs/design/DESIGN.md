---
version: alpha
name: NEXTMAKE-elearning-design-analysis
description: "A light, high-legibility Japanese e-learning system derived from the NEXT MAKE corporate site (nextmake.site). It keeps the company's two-tone blue identity — deep corporate navy #004f8d for authority and structure, logo sky-blue #0288d1 for energy and progress — on a white canvas with a pale blue tint surface (#ebf6ff) doing the work that the corporate site gives to full-bleed photography. Where the corporate site is hard-edged (0px radius, 5px–20px letter-spacing on Japanese headings, 120px section rhythm), the learning UI deliberately softens: 12–16px radius on every card, button, and input, tighter tracking, and shorter vertical rhythm, because learners sit inside these screens for an hour, not eight seconds. Type is Noto Sans JP at 1.8 line-height for Japanese and やさしい日本語, Roboto for English eyebrows and numerals. Semantic feedback (correct / incorrect / warning / progress) is a small, fixed four-color set lifted from the corporate stylesheet so quiz states never invent new hues. Ships light-only, but every token is named semantically and a dark mapping is pre-declared so dark mode is a token swap, not a redesign."

colors:
  primary: "#004f8d"
  primary-hover: "#155d99"
  primary-pressed: "#01508d"
  primary-soft: "#ebf6ff"
  on-primary: "#ffffff"
  sky: "#0288d1"
  sky-hover: "#1973b9"
  sky-soft: "#e1f2fb"
  on-sky: "#ffffff"
  canvas: "#ffffff"
  surface-1: "#fafafa"
  surface-2: "#f3f3f3"
  surface-3: "#ebf6ff"
  surface-inverse: "#141416"
  hairline: "#e6e6e6"
  hairline-strong: "#cfcfcf"
  hairline-brand: "#81afd3"
  ink: "#141416"
  ink-body: "#333333"
  ink-muted: "#5f5f5f"
  ink-subtle: "#9e9e9e"
  ink-disabled: "#cacaca"
  on-inverse: "#ffffff"
  semantic-success: "#229b5b"
  semantic-success-soft: "#e8f6ee"
  semantic-error: "#e84545"
  semantic-error-soft: "#fdecec"
  semantic-warning: "#f6db4d"
  semantic-warning-soft: "#fdf8e0"
  semantic-info: "#0078d7"
  focus-ring: "#0288d1"
  overlay: "#141416"

typography:
  display-lg:
    fontFamily: Noto Sans JP
    fontSize: 40px
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: 0.02em
  display-md:
    fontFamily: Noto Sans JP
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: 0.02em
  headline:
    fontFamily: Noto Sans JP
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: 0.02em
  section-title:
    fontFamily: Noto Sans JP
    fontSize: 20px
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: 0.02em
  card-title:
    fontFamily: Noto Sans JP
    fontSize: 18px
    fontWeight: 700
    lineHeight: 1.6
    letterSpacing: 0.01em
  body-lg:
    fontFamily: Noto Sans JP
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.9
    letterSpacing: 0.02em
  body:
    fontFamily: Noto Sans JP
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.8
    letterSpacing: 0.02em
  body-sm:
    fontFamily: Noto Sans JP
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.8
    letterSpacing: 0.02em
  caption:
    fontFamily: Noto Sans JP
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: 0.02em
  easy-japanese:
    fontFamily: Noto Sans JP
    fontSize: 18px
    fontWeight: 400
    lineHeight: 2.1
    letterSpacing: 0.06em
  ruby:
    fontFamily: Noto Sans JP
    fontSize: 10px
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: 0.02em
  button:
    fontFamily: Noto Sans JP
    fontSize: 16px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 0.04em
  label:
    fontFamily: Noto Sans JP
    fontSize: 14px
    fontWeight: 700
    lineHeight: 1.6
    letterSpacing: 0.02em
  eyebrow-en:
    fontFamily: Roboto
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0.35em
  numeral:
    fontFamily: Roboto
    fontSize: 16px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 0.02em
  mono:
    fontFamily: Roboto Mono
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: 0

rounded:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  pill: 9999px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 80px

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 16px 32px
    minHeight: 56px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 16px 32px
  button-primary-disabled:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-disabled}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 16px 32px
  button-sky:
    backgroundColor: "{colors.sky}"
    textColor: "{colors.on-sky}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 16px 32px
    minHeight: 56px
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 16px 32px
    border: 1px solid {colors.primary}
  button-ghost:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-body}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 12px 20px
  text-input:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: 12px 16px
    minHeight: 48px
    border: 1px solid transparent
  text-input-focused:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: 12px 16px
    border: 2px solid {colors.focus-ring}
  text-input-error:
    backgroundColor: "{colors.semantic-error-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: 12px 16px
    border: 1px solid {colors.semantic-error}
  field-label:
    backgroundColor: "transparent"
    textColor: "{colors.ink-body}"
    typography: "{typography.label}"
    rounded: "{rounded.xs}"
  required-tag:
    backgroundColor: "{colors.semantic-error}"
    textColor: "{colors.on-primary}"
    typography: "{typography.caption}"
    rounded: "{rounded.xs}"
    padding: 2px 8px
  login-card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 40px
    border: 1px solid {colors.hairline}
  auth-shell:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.xs}"
    padding: 80px 24px
  sso-button:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-body}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 14px 24px
    border: 1px solid {colors.hairline-strong}
  course-card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 24px
    border: 1px solid {colors.hairline}
  course-card-hover:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 24px
    border: 1px solid {colors.hairline-brand}
  course-thumbnail:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.primary}"
    typography: "{typography.caption}"
    rounded: "{rounded.md}"
    aspectRatio: 16/9
  lesson-row:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-body}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: 16px 20px
  lesson-row-active:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: 16px 20px
  lesson-row-completed:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: 16px 20px
  lesson-row-locked:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink-disabled}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: 16px 20px
  progress-track:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    height: 8px
  progress-fill:
    backgroundColor: "{colors.sky}"
    textColor: "{colors.on-sky}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    height: 8px
  progress-fill-complete:
    backgroundColor: "{colors.semantic-success}"
    textColor: "{colors.on-primary}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    height: 8px
  quiz-option:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-body}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.md}"
    padding: 20px 24px
    border: 1px solid {colors.hairline-strong}
    minHeight: 64px
  quiz-option-selected:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.md}"
    padding: 20px 24px
    border: 2px solid {colors.primary}
  quiz-option-correct:
    backgroundColor: "{colors.semantic-success-soft}"
    textColor: "{colors.semantic-success}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.md}"
    padding: 20px 24px
    border: 2px solid {colors.semantic-success}
  quiz-option-incorrect:
    backgroundColor: "{colors.semantic-error-soft}"
    textColor: "{colors.semantic-error}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.md}"
    padding: 20px 24px
    border: 2px solid {colors.semantic-error}
  feedback-panel-correct:
    backgroundColor: "{colors.semantic-success-soft}"
    textColor: "{colors.ink-body}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: 24px
  feedback-panel-incorrect:
    backgroundColor: "{colors.semantic-error-soft}"
    textColor: "{colors.ink-body}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: 24px
  video-frame:
    backgroundColor: "{colors.surface-inverse}"
    textColor: "{colors.on-inverse}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.lg}"
    aspectRatio: 16/9
  transcript-panel:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink-body}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: 24px
  level-chip:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: 6px 16px
  level-chip-selected:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: 6px 16px
  status-badge-new:
    backgroundColor: "{colors.sky-soft}"
    textColor: "{colors.sky-hover}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: 4px 12px
  status-badge-done:
    backgroundColor: "{colors.semantic-success-soft}"
    textColor: "{colors.semantic-success}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: 4px 12px
  status-badge-due:
    backgroundColor: "{colors.semantic-warning-soft}"
    textColor: "{colors.ink-body}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: 4px 12px
  certificate-card:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 32px
  stat-tile:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.primary}"
    typography: "{typography.numeral}"
    rounded: "{rounded.md}"
    padding: 24px
  side-nav:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-body}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.xs}"
    padding: 24px 16px
    width: 280px
  side-nav-item-active:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: 12px 16px
  top-nav:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-body}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.xs}"
    height: 64px
  breadcrumb:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    typography: "{typography.caption}"
    rounded: "{rounded.xs}"
  tab-default:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.xs}"
    padding: 12px 20px
  tab-selected:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    typography: "{typography.label}"
    rounded: "{rounded.xs}"
    padding: 12px 20px
    border: 2px solid {colors.primary}
  alert-info:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.ink-body}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: 16px 20px
  toast:
    backgroundColor: "{colors.surface-inverse}"
    textColor: "{colors.on-inverse}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: 16px 20px
  modal:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 32px
  avatar:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.primary}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
  empty-state:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 48px
  footer:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-subtle}"
    typography: "{typography.caption}"
    rounded: "{rounded.xs}"
    padding: 40px 24px
---

## Overview

This is the NEXT MAKE design language re-tuned for an e-learning product. The corporate site at nextmake.site is a marketing surface: full-bleed video hero, 120px section gaps, Japanese section headings set at 28px/700 with **5px letter-spacing**, English eyebrows at 14px with tracking as wide as 20px, and a single flat navy CTA (`#004f8d`, 16px/70px padding, zero radius). That vocabulary reads as confident and engineered — and it is completely wrong for a screen a learner sits inside for an hour.

So the learning system inherits the **identity** and rewrites the **ergonomics**:

- **Identity kept.** `{colors.primary}` #004f8d stays the structural brand color, exactly as extracted from the theme stylesheet (33 occurrences — it is the site's only real brand hex). The logo's second color, sky-blue `{colors.sky}` #0288d1, is promoted from a logo-only accent to the **progress and activity color** of the product. The corporate site already carries the pale blue tint `#ebf6ff`; here it becomes `{colors.surface-3}`, the tinted surface that replaces the marketing site's photography.
- **Ergonomics rewritten.** Radius goes from 0px to `{rounded.md}` 12px / `{rounded.lg}` 16px on every card, button, and panel. Japanese tracking drops from 5px to 0.02em. Line-height rises to 1.8 for body and 2.1 for やさしい日本語. Section rhythm compresses from 120px to `{spacing.section}` 80px.

**Two blues, two jobs.** Navy `{colors.primary}` means *structure and authority*: primary CTA, active navigation, selected quiz option, section headings, certificate. Sky `{colors.sky}` means *motion and progress*: progress bar fill, "in progress" markers, streak indicators, focus ring. Never swap them — a navy progress bar reads as a static rule, a sky-blue submit button reads as secondary.

**Semantic feedback is a fixed four.** Success `#229b5b`, error `#e84545`, warning `#f6db4d`, info `#0078d7` — all four are lifted verbatim from the corporate stylesheet, so the quiz UI never invents a hue the brand doesn't already own. Each has a paired `-soft` tint for panel and option fills.

**Light-only, dark-ready.** The product ships light. But every token above is named by *role* (`canvas`, `surface-1..3`, `ink`, `ink-muted`, `hairline`) rather than by value, and the Dark Mode Readiness section below declares the swap table in advance. Adding dark mode later must be a change to the token values, never a change to component definitions.

**Key Characteristics:**
- **White canvas, pale-blue tinted surfaces.** `{colors.surface-3}` #ebf6ff carries what photography carries on the marketing site.
- **Two-blue system** — navy for structure, sky for progress. No third chromatic accent.
- **12–16px radius everywhere.** The corporate site's 0px is abandoned on purpose.
- **Japanese-first typography** — Noto Sans JP, 1.8 line-height, near-zero tracking. Roboto only for English eyebrows and numerals.
- **やさしい日本語 is a first-class type token**, not a content variant: larger size, 2.1 line-height, wider tracking, forced short lines.
- **Hairline borders instead of shadow.** Elevation is carried by `{colors.hairline}` and surface tint; shadow appears only on floating layers (modal, toast, sticky bars).
- **56px primary buttons, 48px inputs, 64px quiz options** — generous tap targets, because learners answer hundreds of questions.

## Colors

> Source: `nextmake.site` theme stylesheet (`assets/styles/style.css`), the corporate logo PNG palette, and computed styles on `/` and `/contact/`.

### Brand

- **Corporate Navy** ({colors.primary}): #004f8d — the site's dominant brand hex. Primary CTA, active nav, selected states, section headings, certificate fill.
- **Navy Hover** ({colors.primary-hover}): #155d99 — hovered primary CTA (taken from the site's own hover ramp).
- **Navy Pressed** ({colors.primary-pressed}): #01508d — pressed / active depress state.
- **Navy Soft** ({colors.primary-soft}): #ebf6ff — pale navy tint. Active lesson row, selected quiz option fill, info alert, side-nav active item.
- **Sky** ({colors.sky}): #0288d1 — the logo's second color. Progress fill, "learning now" markers, focus ring, links inside body copy.
- **Sky Hover** ({colors.sky-hover}): #1973b9 — hovered sky elements.
- **Sky Soft** ({colors.sky-soft}): #e1f2fb — "NEW" badge fill, streak tile.

### Surface

- **Canvas** ({colors.canvas}): #ffffff — the default page background. Everything starts white.
- **Surface 1** ({colors.surface-1}): #fafafa — transcript panels, empty states, disabled rows.
- **Surface 2** ({colors.surface-2}): #f3f3f3 — form input fill (this is the corporate contact form's exact input background), progress track, unselected chips.
- **Surface 3** ({colors.surface-3}): #ebf6ff — the tinted brand surface. Auth page background, stat tiles, course thumbnail placeholder, section bands.
- **Surface Inverse** ({colors.surface-inverse}): #141416 — video player frame, toasts.
- **Hairline** ({colors.hairline}): #e6e6e6 — default 1px card and divider border.
- **Hairline Strong** ({colors.hairline-strong}): #cfcfcf — quiz option border, secondary button border, table rules.
- **Hairline Brand** ({colors.hairline-brand}): #81afd3 — hovered card border, brand-tinted dividers.

### Text

- **Ink** ({colors.ink}): #141416 — headings and emphasized text.
- **Ink Body** ({colors.ink-body}): #333333 — default running text. Softer than pure black; Japanese at 1.8 line-height on pure black fatigues.
- **Ink Muted** ({colors.ink-muted}): #5f5f5f — metadata, timestamps, secondary labels.
- **Ink Subtle** ({colors.ink-subtle}): #9e9e9e — footer text, placeholders, breadcrumb separators.
- **Ink Disabled** ({colors.ink-disabled}): #cacaca — locked lessons, disabled buttons.
- **On Inverse** ({colors.on-inverse}): #ffffff — text on video frame and toasts.

### Semantic

- **Success** ({colors.semantic-success}): #229b5b — correct answer, completed lesson, passing score. Paired fill `{colors.semantic-success-soft}` #e8f6ee.
- **Error** ({colors.semantic-error}): #e84545 — incorrect answer, validation failure, required tag. Paired fill `{colors.semantic-error-soft}` #fdecec. This is the corporate contact form's own 必須 badge color.
- **Warning** ({colors.semantic-warning}): #f6db4d — deadline approaching, unsaved work. Paired fill `{colors.semantic-warning-soft}` #fdf8e0. Never use as text color — it fails contrast; use `{colors.ink-body}` on the soft fill.
- **Info** ({colors.semantic-info}): #0078d7 — system notices distinct from brand messaging.
- **Focus Ring** ({colors.focus-ring}): #0288d1 — 2px outline with 2px offset on every focusable element.

### Contrast Rules

- Body text uses `{colors.ink-body}` on `{colors.canvas}` (12.6:1) or on `{colors.surface-3}` (11.8:1). Both clear AAA.
- `{colors.primary}` on `{colors.canvas}` is 8.6:1 — safe for text and for 14px labels.
- `{colors.sky}` on white is 3.6:1 — **UI/graphic use only** (progress fills, borders, icons at ≥24px). For sky-colored text use `{colors.sky-hover}` #1973b9.
- Never place `{colors.semantic-warning}` text on white.

## Typography

### Font Family

- **Noto Sans JP** — the entire Japanese and やさしい日本語 surface, plus all UI chrome. Weights 400 and 700 only. Fallback: `"Noto Sans JP", "Hiragino Sans", "Yu Gothic", Meiryo, sans-serif`.
- **Roboto** — English eyebrows, numerals, timers, scores, and Latin-only labels. This matches the corporate site, which sets its `READ MORE` buttons in Roboto. Fallback: `Roboto, "Helvetica Neue", Arial, sans-serif`.
- **Roboto Mono** — code samples and answer keys in technical courses only.

**Alternate:** `M PLUS 1p` (or `M PLUS Rounded 1c` for a softer read) is an approved substitute for Noto Sans JP if a warmer tone is wanted. If swapped, swap it everywhere — do not mix M PLUS and Noto Sans JP in one build. `M PLUS Rounded 1c` pairs especially well with the 12–16px radius, but is weaker at 12px caption sizes; keep captions on Noto Sans JP if you use it.

Load only 400 and 700. Japanese webfonts are heavy — subset by `unicode-range` and preload the 400 weight.

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.display-lg}` | 40px | 700 | 1.4 | 0.02em | Course landing hero, dashboard greeting |
| `{typography.display-md}` | 32px | 700 | 1.4 | 0.02em | Page title |
| `{typography.headline}` | 24px | 700 | 1.5 | 0.02em | Lesson title, modal title |
| `{typography.section-title}` | 20px | 700 | 1.5 | 0.02em | Section heading inside a page |
| `{typography.card-title}` | 18px | 700 | 1.6 | 0.01em | Course card title, lesson row title |
| `{typography.body-lg}` | 18px | 400 | 1.9 | 0.02em | Lesson body copy, quiz question and options |
| `{typography.body}` | 16px | 400 | 1.8 | 0.02em | Default body |
| `{typography.body-sm}` | 14px | 400 | 1.8 | 0.02em | Nav items, table cells, helper text |
| `{typography.caption}` | 12px | 400 | 1.6 | 0.02em | Badges, timestamps, footnotes |
| `{typography.easy-japanese}` | 18px | 400 | 2.1 | 0.06em | やさしい日本語 content blocks |
| `{typography.ruby}` | 10px | 400 | 1.2 | 0.02em | ふりがな above kanji |
| `{typography.button}` | 16px | 700 | 1.2 | 0.04em | All button labels |
| `{typography.label}` | 14px | 700 | 1.6 | 0.02em | Form labels, tab labels |
| `{typography.eyebrow-en}` | 14px | 400 | 1.4 | 0.35em | English section eyebrow (`COURSES`, `MY LEARNING`) |
| `{typography.numeral}` | 16px | 700 | 1.2 | 0.02em | Scores, progress %, timers — Roboto tabular figures |
| `{typography.mono}` | 14px | 400 | 1.7 | 0 | Code blocks |

### Principles

- **Japanese line-height never drops below 1.8.** Kanji density plus a 16px size needs air. This is the single most important type rule in the system.
- **Tracking is near-zero for reading, wide for labeling.** Body sits at 0.02em. The English eyebrow keeps the corporate site's signature wide tracking (0.35em) — it is the one place the marketing voice survives intact.
- **Never apply the marketing site's 5px tracking to Japanese body copy.** It is a headline effect and it destroys reading speed at paragraph length.
- **Two weights only** — 400 and 700. No 500, no 300. Weight is hierarchy; size is scale.
- **Numerals are Roboto.** Scores, percentages, and countdown timers use `{typography.numeral}` with `font-variant-numeric: tabular-nums` so digits don't jitter as they count.
- **Measure caps at 40 Japanese characters** (~640px) for `{typography.body}` and **28 characters** for `{typography.easy-japanese}`.

### やさしい日本語 Mode

`{typography.easy-japanese}` is a real token, not a style suggestion. When a learner selects やさしい日本語:

- Body copy switches from `{typography.body}` to `{typography.easy-japanese}` (18px / 2.1 / 0.06em).
- Line length caps at ~28 characters; **break at 文節 boundaries**, never mid-phrase.
- ふりがな renders in `{typography.ruby}` on every kanji outside the N5 set.
- Paragraph gap widens from `{spacing.md}` 16px to `{spacing.lg}` 24px.
- Level chips (`level-chip` / `level-chip-selected`) expose the switch: `やさしい日本語 · 日本語 · English`.

## Layout

### Spacing System

- **Base unit**: 4px.
- **Tokens**: `{spacing.xxs}` 4px · `{spacing.xs}` 8px · `{spacing.sm}` 12px · `{spacing.md}` 16px · `{spacing.lg}` 24px · `{spacing.xl}` 32px · `{spacing.xxl}` 48px · `{spacing.section}` 80px.
- Card padding: `{spacing.lg}` 24px on course cards; `{spacing.xl}` 32px on modals and certificates; 40px on the login card.
- Button padding: 16px vertical · 32px horizontal (the corporate site's 70px horizontal is a marketing flourish — too wide for a dense product UI).
- Input padding: 12px vertical · 16px horizontal.
- Vertical gap between form fields: `{spacing.lg}` 24px.

### Grid & Container

- **Max content width 1200px**, with a 1040px reading column for lesson text.
- **Learning shell**: 280px `side-nav` (course outline) + fluid content. Below 1024px the side nav becomes a collapsible drawer.
- **Course grid**: 3-up at ≥1280px, 2-up at 1024px, 1-up below 768px. Gap `{spacing.lg}` 24px.
- **Dashboard stat row**: 4-up `stat-tile` at desktop, 2×2 at tablet, stacked at mobile.
- **Auth pages** are single-column: `auth-shell` fills the viewport in `{colors.surface-3}`, with a centered `login-card` at max 440px.

### Whitespace Philosophy

White is the material. Sections separate by `{spacing.section}` 80px of canvas or by a shift onto `{colors.surface-3}` — not by rules. Inside a lesson, whitespace is *reading* whitespace: the 1.8 line-height and 24px paragraph gaps do more work than any divider. Use `{colors.hairline}` rules only where a boundary is genuinely ambiguous (table rows, list separators).

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| 0 (flat) | No border, no shadow | Body text, page background |
| 1 (hairline) | 1px `{colors.hairline}`, `{rounded.lg}` | Course cards, login card, panels |
| 2 (tint) | `{colors.surface-3}` or `{colors.surface-1}` fill, no border | Stat tiles, transcript panel, section bands |
| 3 (sticky) | White fill + `0 1px 0 {colors.hairline}` | Sticky top nav, sticky quiz footer |
| 4 (float) | `0 8px 24px rgba(20,20,22,0.12)`, `{rounded.lg}` | Modals, dropdowns, toasts |
| 5 (scrim) | `{colors.overlay}` at 50% | Modal backdrop |
| focus | 2px `{colors.focus-ring}` outline, 2px offset | Every focusable element |

Depth is carried by **hairline + surface tint first, shadow last.** A card that only needs to feel separate gets a border, not a shadow. Reserve shadow for things that genuinely float above the page.

### Decorative Depth

- Course thumbnails and instructor photos are the only imagery. They sit in `{rounded.md}` 12px frames at 16:9.
- No gradients. The corporate site is flat, and flat survives the translation.
- The video player is the one dark object on the page — `{colors.surface-inverse}` in a `{rounded.lg}` 16px frame. It anchors the lesson view.

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.xs}` | 4px | Required tags, tiny markers, nav containers |
| `{rounded.sm}` | 8px | Form inputs, small chips |
| `{rounded.md}` | 12px | Buttons, quiz options, lesson rows, thumbnails, alerts, toasts |
| `{rounded.lg}` | 16px | Course cards, login card, modals, video frame, certificates |
| `{rounded.xl}` | 24px | Full-width feature panels (rare) |
| `{rounded.pill}` | 9999px | Progress bars, status badges, level chips |
| `{rounded.full}` | 9999px | Avatars |

**Rule of thumb: interactive → 12px, container → 16px, status → pill, input → 8px.** Inputs stay tighter than buttons so a field never reads as a button.

### Photography & Illustration Geometry

- Course thumbnails: 16:9, `{rounded.md}` 12px, `{colors.surface-3}` placeholder with the course initial in `{colors.primary}` when no image exists.
- Avatars: `{rounded.full}` at 32px (rows), 40px (nav), 64px (profile).
- Icons: 24px stroke icons at 1.5px weight, colored `{colors.ink-muted}` by default and `{colors.primary}` when active.

## Components

### Buttons

**`button-primary`** — The navy CTA. "ログイン", "次のレッスンへ", "回答する".
- `{colors.primary}` fill, `{colors.on-primary}` text, `{typography.button}`, `{rounded.md}` 12px, padding 16px 32px, min-height 56px.
- Hover → `button-primary-hover` (`{colors.primary-hover}`). Pressed → `{colors.primary-pressed}`.
- Disabled → `button-primary-disabled`: `{colors.surface-2}` fill, `{colors.ink-disabled}` text, no border.

**`button-sky`** — Sky CTA for *resuming* actions only: "学習を再開する", "続きから". Same geometry, `{colors.sky}` fill. Never more than one per screen.

**`button-secondary`** — Outlined navy. "キャンセル", "あとで", "戻る".
- `{colors.canvas}` fill, `{colors.primary}` text and 1px border, `{rounded.md}`.

**`button-ghost`** — Text-only action inside dense rows. `{colors.ink-body}` text, 12px 20px padding.

### Inputs & Forms

**`text-input`** — `{colors.surface-2}` #f3f3f3 fill with a transparent 1px border, `{rounded.sm}` 8px, 12px/16px padding, min-height 48px. The gray fill is inherited directly from the corporate contact form; the radius and height are not.
- **`text-input-focused`** — fill lifts to `{colors.canvas}` and a 2px `{colors.focus-ring}` border appears. The fill change matters: it signals "this is where you are typing".
- **`text-input-error`** — `{colors.semantic-error-soft}` fill, 1px `{colors.semantic-error}` border, with an error message below in `{typography.caption}` `{colors.semantic-error}`.

**`field-label`** — `{typography.label}` 14px/700 `{colors.ink-body}`, always **above** the field, never a floating placeholder. Placeholders are `{colors.ink-subtle}` and never carry required information.

**`required-tag`** — `{colors.semantic-error}` fill, white `{typography.caption}`, `{rounded.xs}` 4px, 2px 8px padding. Reads 必須. Lifted verbatim from nextmake.site's contact form.

### Authentication

**`auth-shell`** — The login/signup page background: `{colors.surface-3}` #ebf6ff filling the viewport, 80px vertical padding, centered content. The tint is what makes an auth page feel like NEXT MAKE without needing a hero image.

**`login-card`** — `{colors.canvas}` fill, 1px `{colors.hairline}`, `{rounded.lg}` 16px, **40px padding**, max-width 440px.
- Structure, top to bottom: NEXT MAKE logo (navy, ~140px wide) · `{typography.headline}` title ("ログイン") · fields · primary CTA full-width · secondary links.
- The email and password fields are `text-input` at full width with `{spacing.lg}` 24px between them.
- The submit button is `button-primary` at `width: 100%`.
- Below the CTA: "パスワードをお忘れですか？" in `{typography.body-sm}` `{colors.sky-hover}`, and a `{colors.hairline}` divider before any SSO block.
- Auth errors render as a full-width `alert` variant using `{colors.semantic-error-soft}` fill and `{colors.semantic-error}` text **above** the fields, not as a toast — the learner must see it next to the form.

**`sso-button`** — `{colors.canvas}` fill, 1px `{colors.hairline-strong}`, `{rounded.md}` 12px, 14px/24px padding, provider mark left-aligned at 20px, label centered in `{typography.button}` at `{colors.ink-body}`. Stack vertically at `{spacing.sm}` 12px gaps.

**Password fields** carry a show/hide toggle as a `{colors.ink-muted}` 20px icon inside the field's right padding. Never truncate or mask the toggle on mobile.

**Session states.** "ログイン状態を保持する" is a checkbox in `{colors.primary}` at 20px with `{rounded.xs}` 4px. Logged-out redirects land on `auth-shell` with an `alert-info` explaining why.

### Course & Lesson

**`course-card`** — `{colors.canvas}`, 1px `{colors.hairline}`, `{rounded.lg}` 16px, 24px padding.
- Layout: `course-thumbnail` (16:9, `{rounded.md}`) → level chip row → `{typography.card-title}` title → `{typography.body-sm}` `{colors.ink-muted}` description (2 lines, clamped) → `progress-track` + `{typography.numeral}` percentage.
- **`course-card-hover`** — border shifts to `{colors.hairline-brand}` #81afd3. No lift, no shadow, no scale.

**`lesson-row`** — One row in the course outline. `{rounded.md}` 12px, 16px/20px padding, 24px status icon on the left.
- **`lesson-row-active`** — `{colors.primary-soft}` fill, `{colors.primary}` text. This is the learner's current position.
- **`lesson-row-completed`** — white fill, `{colors.ink-muted}` text, `{colors.semantic-success}` check icon.
- **`lesson-row-locked`** — `{colors.surface-1}` fill, `{colors.ink-disabled}` text, lock icon. Not clickable, but still focusable with an explanatory tooltip.

**`progress-track`** + **`progress-fill`** — 8px tall, `{rounded.pill}`. Track `{colors.surface-2}`, fill `{colors.sky}`. At 100% the fill switches to `progress-fill-complete` (`{colors.semantic-success}`) — the color change *is* the completion celebration. Always pair with a `{typography.numeral}` percentage; a bar alone is not accessible.

**`stat-tile`** — Dashboard metric. `{colors.surface-3}` fill, `{rounded.md}`, 24px padding. Large `{typography.display-md}` numeral in `{colors.primary}` over a `{typography.caption}` `{colors.ink-muted}` label.

**`certificate-card`** — Completion certificate. `{colors.primary}` fill, white text, `{rounded.lg}`, 32px padding. The only large navy block in the product — it should feel like an award because it is rare.

### Quiz

**`quiz-option`** — 64px min-height, `{rounded.md}` 12px, 20px/24px padding, 1px `{colors.hairline-strong}` border, `{typography.body-lg}` 18px text. Large because learners tap these constantly.
- **`quiz-option-selected`** — `{colors.primary-soft}` fill, 2px `{colors.primary}` border, `{colors.primary}` text.
- **`quiz-option-correct`** — `{colors.semantic-success-soft}` fill, 2px `{colors.semantic-success}` border, plus a ✓ icon. **Never color-only** — the icon carries the meaning for colorblind learners.
- **`quiz-option-incorrect`** — `{colors.semantic-error-soft}` fill, 2px `{colors.semantic-error}` border, plus a ✕ icon.
- Options stack vertically at `{spacing.sm}` 12px gaps. Never side-by-side — Japanese options wrap unpredictably.

**`feedback-panel-correct`** / **`feedback-panel-incorrect`** — Explanation panel below the question after answering. Soft semantic fill, `{rounded.md}`, 24px padding, `{typography.body}` `{colors.ink-body}` explanation text. Always explain, even when correct.

**Quiz footer** is sticky at elevation 3: progress ("3 / 10" in `{typography.numeral}`) on the left, `button-primary` on the right.

### Video & Content

**`video-frame`** — `{colors.surface-inverse}` #141416, `{rounded.lg}` 16px, 16:9. Controls in `{colors.on-inverse}`; the scrubber uses `{colors.sky}` for played progress. Captions default **on** for Japanese content.

**`transcript-panel`** — `{colors.surface-1}` fill, `{rounded.md}`, 24px padding, `{typography.body}`. The active line highlights with `{colors.primary-soft}` background. Scrolls independently beside the video at ≥1280px, collapses below the player under that.

### Chips, Badges & Levels

**`level-chip`** / **`level-chip-selected`** — Pill toggles for JLPT level (N5 / N4 / N3) and language mode (やさしい日本語 / 日本語 / English). Default `{colors.surface-2}` with `{colors.ink-muted}`; selected `{colors.primary}` with white. Min tap height 36px, 44px on touch.

**`status-badge-new`** (`{colors.sky-soft}` / `{colors.sky-hover}`) · **`status-badge-done`** (`{colors.semantic-success-soft}` / `{colors.semantic-success}`) · **`status-badge-due`** (`{colors.semantic-warning-soft}` / `{colors.ink-body}`) — all `{rounded.pill}`, `{typography.caption}`, 4px/12px padding.

### Navigation

**`top-nav`** — 64px, `{colors.canvas}`, bottom hairline, sticky. NEXT MAKE logo left (navy version), search center, avatar + notification right. Turns to elevation 3 on scroll.

**`side-nav`** — 280px, white, 24px/16px padding. Section labels in `{typography.eyebrow-en}` `{colors.ink-subtle}`; items in `{typography.body-sm}`.
- **`side-nav-item-active`** — `{colors.primary-soft}` fill, `{colors.primary}` text, `{rounded.sm}` 8px.

**`breadcrumb`** — `{typography.caption}` `{colors.ink-muted}`, `›` separators in `{colors.ink-subtle}`, current page in `{colors.ink-body}`.

**`tab-default`** / **`tab-selected`** — Underline tabs. Selected carries a 2px `{colors.primary}` bottom border and `{colors.primary}` text. No pill tabs, no filled tabs.

### Feedback & Overlays

**`alert-info`** — `{colors.primary-soft}` fill, `{rounded.md}`, 16px/20px padding, 20px icon left. Error / success / warning variants swap to the matching `-soft` fill and semantic icon color.

**`toast`** — `{colors.surface-inverse}` fill, white text, `{rounded.md}`, elevation 4, bottom-center, auto-dismiss at 4s. Never use a toast for anything the learner must act on.

**`modal`** — `{colors.canvas}`, `{rounded.lg}` 16px, 32px padding, max-width 560px, elevation 4 over a 50% `{colors.overlay}` scrim. Title `{typography.headline}`, actions bottom-right with `button-secondary` before `button-primary`.

**`empty-state`** — `{colors.surface-1}` fill, `{rounded.lg}`, 48px padding, centered. `{typography.body}` `{colors.ink-muted}` message plus one `button-primary`. Always offer the next action; never a dead end.

**`avatar`** — `{colors.surface-3}` fill with `{colors.primary}` initials in `{typography.label}`, `{rounded.full}`.

### Footer

**`footer`** — `{colors.canvas}`, top hairline, 40px/24px padding, `{typography.caption}` `{colors.ink-subtle}`. Deliberately quiet — the corporate site's dense link grid does not belong inside a learning app.

## Do's and Don'ts

### Do

- Keep `{colors.primary}` #004f8d for structure and `{colors.sky}` #0288d1 for progress. Two blues, two jobs.
- Round every interactive surface to `{rounded.md}` 12px and every container to `{rounded.lg}` 16px.
- Hold Japanese body copy at 1.8 line-height minimum; やさしい日本語 at 2.1.
- Pair every semantic color with an icon or text label — never rely on color alone for correct/incorrect.
- Use `{colors.surface-3}` #ebf6ff where the corporate site would use a photograph.
- Put form labels above fields, always, in `{typography.label}`.
- Keep primary buttons at 56px and quiz options at 64px min-height.
- Set scores, timers, and percentages in `{typography.numeral}` with tabular figures.
- Name every new token by role (`surface-4`, `ink-inverse`), never by value (`light-gray-2`).

### Don't

- Don't apply the corporate site's 5px / 20px letter-spacing to Japanese body copy — that tracking belongs to the English eyebrow only.
- Don't ship 0px radius. The hard corners are the marketing site's voice, not the product's.
- Don't use `{colors.sky}` for text on white (3.6:1) — use `{colors.sky-hover}` #1973b9.
- Don't put `{colors.semantic-warning}` yellow on a white background as text.
- Don't introduce a third chromatic accent (purple, orange, teal) for gamification.
- Don't use a navy progress bar or a sky-blue primary CTA — that inverts the system.
- Don't put quiz options side-by-side; Japanese text wrapping makes the columns ragged.
- Don't use drop shadows for cards. Border first, tint second, shadow only for floating layers.
- Don't hardcode hex values in components. Reference tokens so dark mode remains a swap.
- Don't stack more than one `button-sky` per screen.

## Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Desktop-XL | 1440px | Full learning shell: side nav + content + transcript |
| Desktop | 1280px | Transcript panel moves below the video |
| Laptop | 1024px | Side nav becomes a drawer; course grid 3-up → 2-up |
| Tablet | 768px | Course grid → 1-up; stat tiles 4-up → 2×2; top nav collapses to hamburger |
| Mobile | 480px | Single column; `{typography.display-lg}` 40px → 28px; sticky quiz footer full-width |

### Touch Targets

- Primary buttons ≥56px tall at every viewport.
- Quiz options ≥64px — they are the most-tapped element in the product.
- Level chips and tabs grow from 36px to ≥44px on touch viewports.
- Form inputs ≥48px, rising to 52px on mobile.
- Minimum 8px gap between any two adjacent tap targets.

### Collapsing Strategy

- **Learning shell**: side nav → slide-over drawer below 1024px, triggered from the top nav.
- **Video lesson**: video stays pinned at the top of the viewport while the transcript scrolls beneath it on mobile.
- **Quiz footer**: sticky bottom bar, full-width `button-primary`, progress counter above it.
- **Course grid**: 3 → 2 → 1 columns.
- **Tables** (grades, submissions): become stacked `{rounded.md}` cards below 768px, never horizontally scrolling tables.

### Image Behavior

- Course thumbnails hold 16:9 and crop from the center.
- Avatars never scale below 32px.
- The NEXT MAKE logo swaps to its white variant on `{colors.surface-inverse}` and `{colors.primary}` surfaces.

## Dark Mode Readiness

The product ships **light only**. To keep dark mode a token swap rather than a redesign, every component above references role-named tokens and no component hardcodes a hex. When dark ships, change only these values:

| Token | Light | Dark (planned) |
|---|---|---|
| `canvas` | #ffffff | #141416 |
| `surface-1` | #fafafa | #1c1c1f |
| `surface-2` | #f3f3f3 | #232327 |
| `surface-3` | #ebf6ff | #10243a |
| `surface-inverse` | #141416 | #000000 |
| `hairline` | #e6e6e6 | #2e2e33 |
| `hairline-strong` | #cfcfcf | #3d3d44 |
| `hairline-brand` | #81afd3 | #2f5f88 |
| `ink` | #141416 | #f5f6f7 |
| `ink-body` | #333333 | #d8dade |
| `ink-muted` | #5f5f5f | #9aa0a6 |
| `ink-subtle` | #9e9e9e | #6f757b |
| `ink-disabled` | #cacaca | #4a4f55 |
| `primary` | #004f8d | #4a9fe0 |
| `primary-soft` | #ebf6ff | #10243a |
| `sky` | #0288d1 | #4fc3f7 |
| `semantic-success-soft` | #e8f6ee | #10281c |
| `semantic-error-soft` | #fdecec | #2c1517 |

Rules that make the swap safe:

1. **No hardcoded hex in component code.** Every value comes from a CSS custom property or token reference.
2. **`primary` brightens in dark, it does not stay #004f8d.** Navy on near-black fails contrast. The dark primary is a lighter tint of the same hue.
3. **Elevation inverts.** In dark, elevation is carried by *lighter* surfaces, not by shadow. The `surface-1..3` ladder already expresses this.
4. **Semantic hues keep their hue, gain lightness.** Success stays green, error stays red — only the `-soft` fills flip to dark tints.
5. **Images and thumbnails do not invert.** Add a 4% dark scrim over thumbnails in dark mode instead.
6. Build the token layer with `prefers-color-scheme` plus a `[data-theme]` override from day one, even while only light values are defined. Retrofitting the selector later is the expensive part, not picking the colors.

## Iteration Guide

1. Work on ONE component at a time and refer to it by its `components:` token name.
2. Before styling a section, decide which surface it lives on: `{colors.canvas}`, `{colors.surface-1}`, or `{colors.surface-3}`.
3. Default all Japanese text to `{typography.body}` at 1.8 line-height. Deviate only with a reason.
4. Reach for `{colors.primary}` for structure and `{colors.sky}` for progress. If neither fits, the element probably needs a neutral, not a new color.
5. Add new component variants as separate entries (`quiz-option-reviewed`), never as inline overrides.
6. Every new interactive element needs four states declared: default, hover, focus (2px `{colors.focus-ring}`), disabled.
7. Check any new color pair against the Contrast Rules section before adding it.
8. When adding a component, add its dark-mode row to the swap table at the same time.
9. Run `npx @google/design.md lint DESIGN.md` after edits.

## Known Gaps

- **All values are extracted from the corporate marketing site** (`nextmake.site`), which has no product UI, no logged-in state, and no dark theme. The e-learning components here are *derived* from that language, not observed in a shipping product — treat radius, semantic pairings, and component padding as reasoned proposals to validate with real learners.
- The corporate site declares no CSS custom properties; its colors are Tailwind arbitrary values (`bg-[#004F8D]`) scattered through the theme. The token layer here is new.
- The logo PNG palette contains `#01579b` and `#0288d1`, while the stylesheet uses `#004f8d`. This system standardizes on `#004f8d` for the primary and `#0288d1` for sky. If brand guidelines say otherwise, `#01579b` is the substitute for `primary`.
- The corporate site sets no webfont — it falls back to the system UI stack. Noto Sans JP and Roboto are **chosen here**, not inherited. Confirm licensing and loading budget before launch.
- Khmer is out of scope for this version. If Cambodian learners are added, `Noto Sans Khmer` needs its own line-height token — Khmer requires ~2.0 minimum and the existing `{typography.body}` will clip diacritics.
- Error, empty, and loading states for the video player and file-submission flows are not specified.
- Dark mode values in the swap table are planned, not validated for contrast against real content.
- No motion spec. Assume 150–200ms ease-out for hovers and 250ms for drawers until a motion token set is defined.
