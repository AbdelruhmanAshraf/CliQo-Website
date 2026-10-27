# CliQo | كليكو — design system

**Updated:** 24 October 2026. Applies to the storefront, merchant dashboard, visitor pages, brand communications and physical-product artwork. This document replaces the previous RANK1 black/ivory/gold direction.

## Brand identity

- **Official name:** CliQo | كليكو. Preserve uppercase C and Q in running text.
- **Official slogan, verbatim:** **One Click .. You’re There**
- Keep the two periods, capitalization and curly apostrophe. Do not substitute an earlier slogan or add a second English tagline.
- **Core promise:** make the path from a physical interaction to a useful digital destination simpler.
- **Personality:** smart, human, confident, accessible and energetic.
- **Brand reference:** [current brand guidelines](../output/cliqo-brand-identity/BRAND-GUIDELINES.md).
- **New visual edition:** [GPT Image Gen brand-book folder](../output/cliqo-brand-identity-v2/). Its generated slides are presentation concepts; production uses separately verified artwork.

## Logo and symbol

Preserve the founder-supplied CliQo visual references: bold rounded geometric letterforms, C incorporating wireless/NFC signals, Q incorporating an orange click pointer, and the correctly spelled Arabic name **كليكو**. The Arabic ي has **two separate dots**, never a decorative bar.

Use the bilingual stacked lockup for brand introductions, the horizontal lockup where width permits, and a single-language wordmark only when context makes the brand clear. The symbol combines C, two signal arcs and a compact click pointer. Small sizes use a simplified C/signal mark. Do not mirror the symbol in RTL layouts.

Use matching geometry across variants. Existing v1 SVGs are refined reconstructions of the reference style; compare them against the supplied original before final production. AI-generated logos inside slide mockups are visual demonstrations, not replacement vector masters.

- Primary logo opacity: 100%.
- Clear space: at least the diameter of the English i dot on all sides, measured from visible edges.
- Minimum width: stacked 180px / 40mm; horizontal 300px / 65mm; English 140px / 30mm; Arabic 120px / 28mm.
- Full symbol: 64px / 14mm. Simplified symbol: 16px / 6mm after actual-size checks.
- Never stretch, rotate, recolor, add shadows, apply gradients or replace the Arabic dots.
- Watermark: single-color symbol at 6% green on cream or 5% cream on green. Keep it away from QR codes, small text and primary actions.

## Color tokens

| Token | HEX | Purpose |
|---|---|---|
| Deep Green | `#003A31` | Primary identity, dark surfaces and body text |
| Vivid Orange | `#FF6A00` | Signal, click pointer, accent and selected action cues |
| Warm Cream | `#FFF6E8` | Main light background and negative space |
| Soft White | `#FAFAF8` | Content surfaces |
| Soft Gray | `#E6E8EB` | Dividers and quiet secondary surfaces |

Deep Green must remain dark green; do not drift toward turquoise. Do not retain the former gold numeral, R1 monogram or champagne palette. Vendor/platform marks can retain their legitimate original colors within the CliQo shell.

A 60% green / 30% cream / 10% orange balance is a campaign-composition guide. Reading-heavy screens can use predominantly cream. Prefer flat brand colors, good material finishes and restrained shadow; avoid glow, excessive gradients and decorative visual noise.

### Color and readability

| Pair | Contrast | Allowed use |
|---|---|---|
| Green / Cream | 11.88:1 | Ordinary and large text |
| Green / Soft White | 12.18:1 | Ordinary and large text |
| Green / Orange | 4.43:1 | Large text only; fails 4.5:1 ordinary-text threshold |
| Orange / Cream | 2.68:1 | Decorative accents, not meaningful text |
| Soft White / Orange | 2.75:1 | Avoid text |

Use green-on-cream or cream-on-green for small controls, captions and labels. Orange buttons may use green text at least 20px / 700; smaller controls use cream-on-green with an orange non-text accent. Normal text needs 4.5:1; large text needs 3:1. Do not communicate state by color alone. Validate actual text size, weight, focus and component backgrounds.

## Typography

**English:** ITC Avant Garde Gothic Pro Bold (700), including body copy. **Arabic:** Forma DJR Arabic Deck Medium (500). Use the founder-supplied fonts in `Fonts/` via `next/font/local`; verify loading on mobile. Fallbacks: Arial for English and Tahoma for Arabic.

| Role | English | Arabic | Line height |
|---|---|---|---|
| Display | 64px / 700 | 56px / 500 | 1.1 EN / 1.25 AR |
| H1 | 48px / 700 | 40px / 500 | 1.15 EN / 1.4 AR |
| H2 | 36px / 700 | 32px / 500 | 1.2 EN / 1.4 AR |
| H3 | 24px / 700 | 24px / 500 | 1.3 EN / 1.5 AR |
| Body | 15px / 700 | 17px / 500 | 1.8 EN / 1.9 AR |
| Button / label | 14px / 700 | 16px / 500 | 1.5 EN / 1.7 AR |
| Caption / specs | 12px / 700 | 13px / 500 | 1.6 EN / 1.8 AR |

Button colors must satisfy the separate contrast rule above; the label scale alone does not make green-on-orange text acceptable. Reduce display sizes responsively when needed. Avoid light weights for small text. Never add Arabic letter spacing or stretch connections.

## Shape, spacing and composition

Use soft geometric curves derived from the C, wireless arcs and click pointer. Do not treat every section as a repeated rounded card. Use editorial typography, real product photography, generous negative space and varied but coherent compositions.

- Spacing rhythm: 4, 8, 12, 16, 24, 32, 48, 64, 96px.
- Control radius: 12px; cards: 24px; hero/image shells: 32px (24px on mobile); pills only where useful.
- Content max width: about 1200px; reading columns narrower.
- Mobile: one column and at least 44 × 44px touch targets.
- QR modules and quiet zones remain square; never round, crop or distort them for style.
- Arabic first, RTL by default. Isolate names, URLs, phone numbers and codes with correct bidirectional handling.
- Align bilingual blocks optically rather than forcing equal point sizes or identical baselines.

## Website and dashboard layouts

| Screen | Composition | Main action |
|---|---|---|
| Home | Green hero, actual stand/phone result, cream explanation, exact slogan | Ask about the stand |
| Product catalog | Six product families with clear availability and real/concept imagery | Open ready product |
| Stand product | One 100 × 150mm body, use-specific faces, materials and artwork choices | Select use / add to cart when ready |
| How it works | Place, tap/scan, destination; dashboard update shown separately | Watch demo / ask |
| Owner dashboard | Cream utility surface, all owned smart items, destination, page, status and analytics | Save / publish / pause |
| Multi-link visitor page | Owner cover, avatar, details and ordered action buttons; reusable across supported stand/square pad/card items | Choose owner action |
| Analytics | Opens and action clicks by item and page, short time chart, plain labels | Inspect item |
| Unknown/disabled link | Calm CliQo explanation and support | Contact support |

The header uses the CliQo mark and short Arabic navigation. Show a single main CTA per section. The visitor profile prioritizes the merchant identity; CliQo is a restrained endorsement. Use visible focus, labeled controls, informative validation and clear published/draft states.

### Founder-supplied interface references — 25 October 2026

These five screenshots are **interaction references**, not CliQo visual assets or proof that their numbers are real. Use CliQo colors, fonts, logo and original layouts in implementation:

1. [`references/01-landing-page.png`](references/01-landing-page.png): mobile cover + avatar + name, then a clear grid/list of social, payment and contact actions. Use only the links the owner enables; keep the primary action prominent.
2. [`references/02-link-editor.png`](references/02-link-editor.png): editable rows for link label, destination, visibility and ordering. Replace tiny ambiguous controls with labeled, touch-friendly actions and preview/publish states.
3. [`references/03-custom-order-form.png`](references/03-custom-order-form.png): short checkout step for business name, optional logo/design upload and **initial destination URL** for custom design. Show file limits and help without forcing WhatsApp.
4. [`references/04-login.png`](references/04-login.png): simple Arabic-first login and first-use guidance. Authentication method follows the approved secure onboarding flow; the screenshot does not mandate passwords.
5. [`references/05-analytics.png`](references/05-analytics.png): summary counts and time chart. Label metrics as link opens and action clicks; do not claim exact unique people or separate QR/NFC counts when both use the same URL.

## Product and application rules

- The stand remains **100 × 150mm / 10 × 15cm**; do not call it exact ISO A6.
- One physical stand body supports Review, one payment method, one social platform, or All-in-One. Product scope follows [product.md](../product.md).
- Google Review faces can use required black/white platform treatment; CliQo signature uses an appropriate approved monochrome or full-color variant. Other platform colors support the use, not the core brand palette.
- Any supported multi-link face on stand, square pad or card has one clear tap/scan entry on the physical product; multiple links live on the phone page. One page can serve several owned items or one item can have its own page.
- Cards prioritize the owner name. Place the tap target near the tested chip location.
- Protect QR with at least four modules of quiet zone, strong contrast and real-size testing.
- Packaging starts with manufacturable corrugated mailers and good protection, with green/cream artwork and small orange accents.
- Future family: Point, Tile, ID, Fold, Snap and Loop are naming proposals. Review, Pay, Social, One and Custom identify use variants; they are not proof of stock, certified compatibility or final manufacturing dimensions.
- Social templates: post 1080×1080, story 1080×1920. Keep key story text 250px clear of top and bottom, then inspect the platform preview.
- Generated product images and interfaces must be described as concepts until real samples and screens exist.

## Voice and slogan use

Use the exact slogan **One Click .. You’re There** on primary brand introductions, campaign closing frames and suitable packaging. It is the sole official slogan. Supporting Egyptian Arabic copy can explain the use naturally without becoming an alternative slogan.

Examples: «كل روابطك في مكان واحد»، «المس أو امسح وافتح الرابط»، «غيّر الرابط من حسابك»، «شاركنا تجربتك». Keep copy short, helpful and confident. Use “اسأل عن السعر” until prices are approved.

Never promise guaranteed five-star ratings, rankings, followers or sales. Do not imply CliQo transfers money or passive NFC locates lost items. Tracker hardware, magnetic compatibility and metal-card performance require separate verification.

## Motion, accessibility and production

Use semantic headings, keyboard support, visible focus, labeled forms, helpful errors and meaningful alt text. Motion is purposeful and short: 160–240ms, without continuous pulsing. Honor `prefers-reduced-motion`. Test real Arabic content on mobile and desktop.

Production uses SVG/verified vectors, transparent sRGB PNGs for screen, and separate supplier-specific print PDFs. Raster slides are visual presentations; they are not editable logo masters or manufacturing dielines. Print images should reach 300ppi at final size. Bleed, ICC profile and die-cut constraints follow the selected supplier and a real proof. Test NFC and QR after assembly.

## Delivery boundary

This update changes documentation and the branding presentation. The website code, accounts, domains, printed links and deployed pages require their own implementation step; documentation does not establish that those changes were deployed. Historical URLs and technical identifiers remain intact until a planned migration.

## Bilingual website — 27 October 2026

The entire website uses next-intl with `ar` (default, RTL) and `en` (LTR), selected through the header and persisted in a one-year cookie. Paths and printed item URLs remain unchanged. System UI, metadata and validation are translated; customer-authored names and page content retain their original language with automatic direction. Fonts above supersede the older brand-book font guidance for this website. Preserve SKU values, stock gates, authentication, and QR geometry.
