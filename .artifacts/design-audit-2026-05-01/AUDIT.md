# Visual Audit — 2026-05-01

Audit performed via code review (Playwright MCP cache permission failure
prevented screenshot capture; sufficient signal from code).

## Quantitative

| Surface | Bordered card count | Distinct visual treatments | Verdict |
|---|---:|---:|---|
| Landing — Hero | 3 (scenario cards, inset stroke) | 1 base + 2 tonal variants | ok |
| Landing — How It Works | **4** (`PremiumCard`) | 1 | repetitive |
| Landing — AI Tools / Сценарии | **6** (`PremiumCard` gold/lavender) | 1 + 2 tones | repetitive |
| Landing — Trust | **3** (`PremiumCard` gold/lavender) | 1 + 2 tones | repetitive |
| Landing — For Practitioners | **6** (`PremiumCard` default) | 1 | repetitive |
| Landing — FAQ | 0 (divide-y accordion) | accordion | ✓ already good |
| Landing total | **~22 bordered cards on one page** | 3 | **border fatigue** |

## Root cause

`PremiumCard` (`web/src/components/v5/premium.tsx:87`) is the only depth
primitive in the design system. Every information-dense section reaches for
it because there is no alternative. The result: 22 cards visible on a single
page, all sharing the same `border 1px line-soft + radius-card + glass
gradient + shadow` recipe. The `tone="gold|lavender"` variant only changes
border colour and a corner radial gradient — not enough variation to break
the pattern.

The surrounding `PremiumSection` wrapper adds another layer of uniformity:
every section has `eyebrow → title → lead → grid` structure with identical
spacing.

## What works (do not break)

- **`HaloSymbol`** SVG (`components/brand/brand-mark.tsx:8`) — pure SVG,
  uses CSS variables, animates well. Keep as-is.
- **Hero `landing-question-surface`** — distinctive: layered radial
  gradients + double inset shadow + focus ring change. This is what the rest
  of the design should aspire to.
- **FAQ accordion** — borderless `divide-y` pattern, exactly the kind of
  alternative we need elsewhere.
- **Motion tokens** in `v5-tokens.css` — `--motion-fast/base/slow` already
  exist, plus `--ease-standard`. Just need richer scale + 1 spring easing.
- **Backdrop layered radial gradients** in `body` and `landing-hero` — solid
  atmospheric backgrounds. Reuse the technique elsewhere.

## What needs to die

- **PNG logos.** `BrandLogo` and `HaloMark` (`brand-mark.tsx:128, :160`)
  reference PNG assets via `next/image`. Replace with SVG components.
- **`--font-sans` and `--font-heading` are not declared as actual fonts.**
  No `next/font` import is loading distinctive faces. Currently the body
  inherits system stack, heading falls back. Need explicit Fraunces +
  General Sans wiring.
- **Single-recipe card system.** Need at least 4 depth primitives: elevated,
  glow-edge, inset-gradient, soft-stroke. PremiumCard becomes one of the
  four, not "the" card.
- **Two near-identical tone variants on every card** (gold/lavender). Reads
  as decoration without information. Tones should signal *meaning* (default
  = neutral, gold = featured/paid, lavender = depth/dialogue), not be
  sprinkled for variety.

## Recommendations carried into Phase 1+

1. Introduce typography tokens with two real font families (Fraunces +
   General Sans) wired through `next/font`.
2. Introduce **4 surface primitives** in CSS layer:
   - `surface-elevated` (no border, shadow + 1px white inner highlight)
   - `surface-glow` (no border, gold or lavender bottom-bleed glow)
   - `surface-inset` (no border, top inset gradient, for stat / quote)
   - `surface-stroke` (1px soft stroke, ONLY for high-density data tables)
3. Apply elevation systematically: section H1 = no surface, primary content
   = elevated, featured = glow, FAQ-like = no surface (accordion).
4. Add motion tokens: `--motion-still` (0ms), `--motion-quick` (90ms),
   `--motion-fast` (160ms), `--motion-base` (220ms), `--motion-slow` (340ms),
   `--motion-celebrate` (520ms); `--ease-soft` (bezier for spring-like
   reveals).
5. Replace landing card grids with non-grid layouts where possible:
   - How It Works → vertical numbered timeline
   - AI Tools → 2x3 stacked carousel with active-card focus
   - Trust → asymmetric two-column with floating accents
   - For Practitioners → split-list with contextual icons left, copy right
6. Kill all PNG-based logos, replace with code-only SVG.
