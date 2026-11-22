# CliQo website — agent brief


<!-- CLIQO-BRAND-UPDATE -->
> **ألوان الموقع — 11 نوفمبر 2026:** **CliQo | كليكو** · **One Click .. You’re There**
> الألوان: Black `#000000` · Orange `#FB6221` · Charcoal `#1E1E1E` · Light Gray `#D1D2D5`. الخطوط: ITC Avant Garde Gothic Pro Bold + Forma DJR Arabic Deck Medium.
> ألوان واجهة الموقع الحالية من لوحة 11 نوفمبر؛ تتقدم على ألوان المراجع الأقدم. الاسم والشعار باقيان كما هما. [مرجع الهوية الحالي](../output/cliqo-brand-identity/BRAND-GUIDELINES.md). أسماء الملفات والمسارات والأكواد والنطاقات القديمة لا تعني إعادة تسميتها أو امتلاك نطاق جديد.
<!-- /CLIQO-BRAND-UPDATE -->

**Updated:** 2 November 2026. The app and self-hosted Supabase run on Hostinger KVM2 behind HTTPS; production builds pass and the web-container healthcheck is healthy. Google Auth is enabled. A sign-in attempt exposed a bad redirect to `0.0.0.0:3000`; the app now uses the configured public site URL, and this fix is deployed. Owner Google sign-in still needs an end-to-end retest. Resend SMTP authentication works; the outbox timer stays off until an actual delivery test succeeds. External backup/restore and load monitoring remain open. This is an implementation brief, not permission to buy services or open sales.

**Operating model:** The founder is currently the sole owner and operator. `/admin` is his main site-management dashboard, separate from customer accounts and dashboards. A second admin is a future option; do not imply a current staff team in the UI or plan.

## Read before building

1. `../product.md` — authoritative stand features, buyer choices, NFC/QR and packaging.
2. `../tech-stack.md` — current local Supabase and planned self-hosted production architecture and launch gates.
3. `design.md` — web identity, typography, layout and claim rules.
4. `Plan.md` — phases, route map and acceptance criteria.
5. `../output/cliqo-brand-identity/BRAND-GUIDELINES.md` — current CliQo brand direction. Treat older square-counter-hub and self-hosted Supabase references as historical where they conflict with files above.

## What to build first

An Arabic-first, mobile-first CliQo store for the full product family, starting implementation with the **100 × 150 mm acrylic stand**. One physical stand body, four use cases:

- **Google Review**: black and white face options; one verified review destination.
- **Payment**: one method per stand, initially InstaPay or Vodafone Cash.
- **Social**: one platform per stand, initially Instagram, TikTok or Facebook.
- **All-in-One**: editable merchant page with cover, avatar, selected links and actions.

All sold stands have NFC and QR pointing to the **same unique CliQo URL**. A customer owns their stand in a private dashboard. Single-use customers can change the allowed destination within the purpose printed on the stand; All-in-One customers can manage their page. Catalog architecture supports the six-product family: stand, coaster, PVC smart card, book-opening wallet, magnetic wallet and round NFC keychain/medallion. Founder update, 1 November 2026: only stand, coaster and card appear publicly while the wallets and keychain lack original product photos. All six remain in owner `/admin/products`, where products can be added, edited, hidden, archived or restored. A product requires at least two images to publish. Purchase remains gated by sample, price, stock and fulfillment approvals. Metal card is later.

**Smart-item model — founder decision, 25 October 2026:** Every unit has a unique preprinted dynamic QR and one stable CliQo URL. Custom-design buyers provide an initial destination in checkout; CliQo sets that destination and writes/tests NFC with the stable URL before shipping. Ready-template buyers claim the item with a private code, configure the destination and write NFC themselves using short PDF/video instructions. The public QR scan never proves ownership. Supported stand, coaster and card faces can point to a multi-link landing page; owners may reuse one page across their items or create separate pages. Their dashboard shows total URL opens and action clicks, plus pause/resume. QR and NFC share the same URL, so no source split in first-release analytics. See `Plan.md` for the revised phases and acceptance gates.

## Updated sales scope — founder decision, 25 October 2026

Build a direct multi-product catalog, cart and guest checkout. Publish only catalog products with approved imagery; currently stand, coaster and card are visible. Enable purchase only for approved, ready SKUs. Buyers choose card payment through a hosted gateway or cash on delivery (COD) where the shipping company supports it. Add a private CliQo CRM dashboard for orders, customers, design approvals, SKU inventory, fulfillment, shipment tracking and COD settlement. Merchant activation follows purchase and preparation of a stand. The store gateway collects only CliQo product sales; a merchant's Payment stand opens that merchant's printed InstaPay or Vodafone Cash method and needs phone testing, not the store gateway. No payment option for a SKU until its sample, price, stock, shipping, policies and provider accounts are approved. Follow the updated phases in `Plan.md`; older inquiry-only wording is superseded.

## Engineering contract

- Use **Next.js App Router, TypeScript, Tailwind CSS, and Supabase Postgres/Auth/Storage**. Develop against local Supabase. Hostinger KVM2 currently runs Next.js and self-hosted Supabase together; load-test before public sales. Follow current Supabase SSR guidance.
- The existing `/s/[id]` is a stand-only prototype. Choose one permanent generic item route on the final CliQo domain before printing a sale QR. Single-link experiences use a non-permanent, no-store redirect; multi-link experiences render published page content. Never cache editable destinations as permanent redirects.
- Use opaque item IDs and one private activation flow. QR/NFC public URLs must never contain a login or activation secret. A scan identifies the item; only a private code or secure order proof claims it.
- Enforce row-level ownership for owners, items, pages, links, uploads and analytics. The browser must never receive secret/service-role keys. Public reads expose only approved published content.
- Validate each destination against the stand's printed type and safely handle bad or unknown links. CliQo must not collect visitor payment credentials or process the actual transfer.
- Keep the public route resilient and small. Log errors and check uptime. Configure production SMTP before onboarding merchants.
- Keep source code and migrations in Git. Pin package versions and commit lockfiles. Do not create Supabase resources, purchase plans, or deploy until the appropriate build/deployment step is requested.

## Content and brand contract

Use **CliQo | كليكو** and the exact slogan **One Click .. You’re There**. Use Black `#000000`, Orange `#FB6221`, Charcoal `#1E1E1E`, and Light Gray `#D1D2D5` for the website; use white for content and contrast; ITC Avant Garde Gothic Pro Bold for English and Forma DJR Arabic Deck Medium for Arabic. Follow the original supplied CliQo logo references: rounded forms, C signal, Q pointer and two separate dots beneath ي. Generated brand-book mockups are visual concepts; retain editable vector artwork for implementation. Copy uses clear Egyptian Arabic and accurate English product terms. The first two months of acquisition are organic POV demonstration and outreach, with honest gifted-product feedback; no paid ads are scheduled.

The founder designs the product, buys NFC and collects factory orders. CliQo programs NFC for custom designs; buyers program NFC for ready templates using the supplied guide. Reported stand body/base/print cost is 40 EGP and NFC+adhesive about 10 EGP, before packaging, shipping, labor and platform costs. Founder update, 1 November 2026: show clearly labelled provisional market-researched prices and proposed bundles; these are isolated from approved SKU prices and checkout. Final sale price and sample approval remain required. Do not invent a subscription policy. `rank1eg.com` belongs to earlier naming research. The production domain is `cliqoeg.com`; social handles and account ownership details remain outside the repository.

Use real product photography when available. Label generated concepts clearly. No fake QR codes presented as live, fabricated reviews or ratings, untested tracker/Find My claims, or claim that CliQo executes payments. Allow merchant-provided logo/design files; CliQo design service is a separate fee and includes one revision round, per `../product.md`.

## Deliverable and proof

Build in the stages in `Plan.md`. At each stage provide the actual files changed, screenshots for desktop/mobile, links or a local preview, and the check results. Before shipping: demonstrate owner isolation, private claim, edits reflecting at the same printed URL, custom and self-programmed NFC on actual phones, shared and separate landing pages, opens/click analytics, pause/resume, a safe invalid-link state, successful email invitation and a recoverable backup. Product sales and deployment remain gated by the conditions in `../tech-stack.md`.
