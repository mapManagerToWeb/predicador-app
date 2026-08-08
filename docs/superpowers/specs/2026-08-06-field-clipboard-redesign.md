# Field Clipboard Redesign — Design Specification

**Date**: 2026-08-06
**Project**: Predicador Frontend
**Status**: Approved for implementation

---

## 1. Subject & Context

**Product**: Territory tracking app for door-to-door ministry work (predicación)
**Audience**: Field workers (encargados/coordinators) using phones outdoors, often one-handed, in varying light
**Core flows**:
- **Login** → Phone-based auth to enter the app
- **Profile** → Create profile (name, phone, avatar)
- **Map** → Select territory, mark blocks (complete/partial), send WhatsApp report
- **Admin** → Configure territory colors

---

## 2. Design Direction: "Field Clipboard"

Lean into the physical artifacts of the work: paper territory cards, clipboards, ballpoint pens, handwritten notes, watch faces for timing sessions. Warm, utilitarian, tactile — not "app-like."

**Why this direction?**
- Field workers already use clipboards. The interface becomes a familiar tool, not an abstract UI.
- Warm paper base reduces glare outdoors vs. pure white; dark mode is deep charcoal (like a notebook at night).
- Single memorable element (the clipboard sheet) carries the identity; everything else stays quiet.

---

## 3. Design Tokens

### 3.1 Color (CSS Custom Properties)

| Token | Light | Dark | Purpose |
|-------|-------|------|---------|
| `--paper` / `--paper-dark` | `#FDFBF7` | `#1A1815` | Page/sheet background |
| `--ink` / `--ink-dark` | `#1D1B18` | `#F5F2EB` | Primary text, icons |
| `--ink-muted` | `#6B6660` | `#A8A39C` | Secondary text, placeholders |
| `--territory-blue` | `#2E5C8A` | `#5A9BD8` | Territory identity, primary actions |
| `--field-amber` | `#B8860B` | `#D4A843` | Partial/tracing mode |
| `--report-green` | `#2D7D3A` | `#4ADE80` | Send report, confirm |
| `--clear-red` | `#B83B3B` | `#F87171` | Clear, cancel, destructive |
| `--clip-metal` | `#C9C3BB` | `#8B8680` | Clipboard clip, dividers |
| `--shadow-ink` | `rgba(29,27,24,0.12)` | `rgba(0,0,0,0.35)` | Elevation shadows |
| `--paper-grain` | `url("data:image/svg+xml,...")` | `url("data:image/svg+xml,...")` | Subtle noise texture |

**Usage rules**:
- `--paper`/`--paper-dark` = full-page backgrounds, sheet backgrounds
- `--ink`/`--ink-dark` = all primary text, SVG stroke/fill
- `--ink-muted` = helper text, placeholders, disabled states
- Semantic colors (blue/amber/green/red) ONLY for their specific actions — never decorative

### 3.2 Typography

| Role | Font | Weights | Use cases |
|------|------|---------|-----------|
| **Display** | `DM Serif Display` | 400 | Territory numbers, page titles, clipboard label |
| **Body** | `Inter` | 400, 500, 600 | All UI text, buttons, inputs, labels |
| **Utility** | `JetBrains Mono` | 400, 500 | Territory IDs, counts, coordinates, timestamps |

**Type scale** (fluid, clamp-based):
- `--text-xs`: 0.75rem / 12px
- `--text-sm`: 0.875rem / 14px
- `--text-base`: 1rem / 16px
- `--text-lg`: 1.125rem / 18px
- `--text-xl`: 1.25rem / 20px
- `--text-2xl`: 1.5rem / 24px
- `--text-3xl`: 2rem / 32px (territory number on clipboard)

### 3.3 Spacing & Radius

| Token | Value | Use |
|-------|-------|-----|
| `--space-1` | 4px | Tight gaps |
| `--space-2` | 8px | Standard gaps |
| `--space-3` | 12px | Component padding |
| `--space-4` | 16px | Section gaps |
| `--space-5` | 24px | Large gaps |
| `--space-6` | 32px | Page margins |
| `--radius-sm` | 8px | Small elements |
| `--radius-md` | 12px | Buttons, inputs |
| `--radius-lg` | 16px | Cards, sheets |
| `--radius-xl` | 24px | Clipboard sheet |

### 3.4 Shadows & Elevation

| Level | Light | Dark | Use |
|-------|-------|------|-----|
| `--elev-1` | `0 1px 3px var(--shadow-ink)` | `0 1px 3px var(--shadow-ink)` | Inputs, chips |
| `--elev-2` | `0 4px 12px var(--shadow-ink)` | `0 4px 12px var(--shadow-ink)` | Cards, dropdowns |
| `--elev-3` | `0 8px 24px var(--shadow-ink)` | `0 8px 24px var(--shadow-ink)` | Clipboard sheet, modals |

---

## 4. Layout Concepts

### 4.1 Map Page — "The Clipboard Sheet"

```
┌─────────────────────────────────────┐
│          MAP (full screen)          │
│                                     │
│                                     │
│                                     │
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐   │  ← Desktop: centered, max 520px
│  │  ════════════════════════════  │   │     Metal clip (SVG)
│  │  ┌───────────────────────┐  │   │
│  │  │  TERRITORIO  12       │  │   │  ← Display font, handwritten feel
│  │  │  23/47 manzanas       │  │   │
│  │  └───────────────────────┘  │   │
│  │  ┌────┐ ┌────┐   ┌────┐    │   │  ← Mode tabs (sticky left)
│  │  │Marc│ │Tra │   │Sat │    │   │
│  │  └────┘ └────┘   └────┘    │   │
│  │                           │   │
│  │  ┌──────────┐ ┌────────┐  │   │  ← Actions (right)
│  │  │ Mañana ▼ │ │ Enviar │  │   │
│  │  └──────────┘ └────────┘  │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

**Mobile**: Sheet = full viewport width, pinned to bottom, safe-area padded.
**Desktop**: Sheet = floating card (max-width 520px), centered horizontally, 24px from bottom.

### 4.2 Auth Pages (Login / Profile) — "Form on Clipboard"

```
┌─────────────────────────────────────┐
│          PAPER BACKGROUND           │
│                                     │
│        ┌─────────────────────┐      │
│        │  ═════════════════  │      │  ← Clip at top of card
│        │  ┌───────────────┐  │      │
│        │  │  PREDICADOR   │  │      │  ← Display font
│        │  │  Territorios  │  │      │
│        │  └───────────────┘  │      │
│        │                     │      │
│        │  ┌─────────────┐   │      │
│        │  │ +56 9 1234  │   │      │  ← Input with prefix
│        │  │    5678     │   │      │
│        │  └─────────────┘   │      │
│        │                     │      │
│        │  ┌─────────────┐   │      │
│        │  │   Conectar  │   │      │  ← Primary button
│        │  └─────────────┘   │      │
│        │                     │      │
│        │  No tienes cuenta?  │      │
│        │  Crear perfil  →    │      │
│        └─────────────────────┘      │
└─────────────────────────────────────┘
```

No animated gradient blobs. Paper texture + clip provides character.

### 4.3 Admin — "Territory Cards on Clipboard"

Grid of paper cards, each with:
- Territory number (display font)
- Color swatches as "ink dots"
- Current color preview

---

## 5. Signature Element: The Territory Clipboard Sheet

**The one thing users remember.**

Physical properties:
- **Paper grain**: Subtle SVG noise filter (CSS `filter: url(#paper-grain)`)
- **Metal clip**: SVG at top center, clips the sheet to "the board"
- **Handwritten territory label**: DM Serif Display, slight rotation (-1deg), ink color
- **Mode tabs**: Left edge, shaped like sticky tabs, active = ink fill
- **Actions**: Right edge, ballpoint-pen button style
- **Slide-up animation**: 300ms cubic-bezier(0.34, 1.56, 0.64, 1) — feels like placing a sheet on a clipboard

---

## 6. Component Specifications

### 6.1 Buttons

| Variant | Style | States |
|---------|-------|--------|
| **Primary** (Send, Save) | `--report-green` fill, `--ink-dark` text, `--radius-md` | Hover: darker green, Active: scale(0.98) |
| **Secondary** (Mode tabs) | Transparent, `--ink` text, tab shape | Active: `--territory-blue` fill, white text |
| **Destructive** (Clear, Cancel) | `--clear-red` fill, white text | Hover: darker red |
| **Ghost** (Theme toggle, Logout) | Transparent, border `--clip-metal` | Hover: `--paper-grain` bg |

**Touch targets**: Minimum 48×48px (mobile), 44×44px (desktop)

### 6.2 Inputs

- Height: 48px mobile / 44px desktop
- Background: `--paper` with subtle inner shadow
- Border: 1.5px `--clip-metal`
- Focus: 2px `--territory-blue` outline, offset 2px
- Prefix (phone): `--ink-muted` text, `--clip-metal` divider

### 6.3 Select (Predicación)

- Native select styled to match inputs
- Custom chevron (JetBrains Mono)
- Dropdown inherits paper background

### 6.4 Toast

- Paper card, `--elev-3`, clipped to clipboard metaphor
- Icon: ballpoint pen stroke style

---

## 7. Motion & Interaction

| Interaction | Duration | Easing | Note |
|-------------|----------|--------|------|
| Sheet slide-up | 300ms | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Overshoot feels like "placing" |
| Mode tab switch | 150ms | `ease-out` | Ink fill animation |
| Button press | 80ms | `ease-out` | Scale(0.98) |
| Toast in/out | 250ms | `ease-out` | Slide from bottom |
| Theme toggle | 200ms | `ease-in-out` | Cross-fade paper/ink |

**Reduced motion**: All animations disabled via `@media (prefers-reduced-motion: reduce)`

---

## 8. Accessibility

- **Contrast**: All text ≥ 4.5:1 (WCAG AA), large text ≥ 3:1
- **Focus**: Visible 2px outline on all interactive elements
- **Touch targets**: ≥ 48×48px on mobile
- **Safe areas**: `env(safe-area-inset-*)` on all edges
- **ARIA**: Labels, roles, live regions preserved from current implementation
- **Color independence**: Never color-only for state (icons + labels + shape)

---

## 9. Responsive Breakpoints

| Breakpoint | Map Sheet | Auth Card | Admin Grid |
|------------|-----------|-----------|------------|
| < 480px | Full width, bottom pinned | 90vw, centered | 1 col |
| 480–768px | Full width, bottom pinned | 90vw, centered | 2 col |
| 768–1024px | Floating, max 480px | 440px max | 3 col |
| > 1024px | Floating, max 520px | 440px max | 4 col |

---

## 10. Implementation Scope

### Files to modify:
1. **`src/styles.css`** — Design tokens, global resets, paper grain filter, font imports
2. **`src/app/app.css`** — Toast redesign
3. **`src/app/features/map/map.html` + `map.css`** — Clipboard sheet markup & styles
4. **`src/app/features/auth/login.html` + `login.css` + `auth.css`** — Form card on clipboard
5. **`src/app/features/profile/profile.html` + `profile.css`** — Form card on clipboard
6. **`src/app/features/admin/admin.html` + `admin.css`** — Territory cards grid
7. **`src/app/features/map/territory-search/territory-search.css`** — Search input restyle
8. **`src/index.html`** — Preconnect for Google Fonts (DM Serif Display, Inter, JetBrains Mono)

### New assets:
- Paper grain SVG filter (inline in CSS)
- Clipboard clip SVG (inline)
- Mode tab sticky shape (CSS clip-path)

---

## 11. Self-Review Checklist

- [x] No "TBD" or placeholders
- [x] Color tokens have both light/dark values
- [x] Type scale is fluid and accessible
- [x] Signature element is singular and justified
- [x] Motion respects reduced-motion
- [x] Touch targets meet minimums
- [x] Contrast ratios specified
- [x] Breakpoints cover mobile → desktop
- [x] File list is complete and accurate
- [x] No unrelated refactoring included

---

## 12. Next Steps

1. User reviews this spec
2. Invoke `writing-plans` skill to create implementation plan
3. Implement in phases: tokens → global → map sheet → auth → admin → search
4. Verify each phase with lint/build/test