# CliQo website — agent brief


<!-- CLIQO-BRAND-UPDATE -->
> **تحديث الهوية — 24 أكتوبر 2026:** **CliQo | كليكو** · **One Click .. You’re There**  
> الألوان: Deep Green `#003A31` · Orange `#FF6A00` · Cream `#FFF6E8` · White `#FAFAF8` · Gray `#E6E8EB`. الخطوط: ITC Avant Garde Gothic Pro Bold + Forma DJR Arabic Deck Medium.  
> هوية التنفيذ الحالية معتمدة بهذا الاسم والشعار والألوان؛ أي اتجاه أقدم أدناه تتقدمه هذه المواصفات. [مرجع الهوية الحالي](../output/cliqo-brand-identity/BRAND-GUIDELINES.md). أسماء الملفات والمسارات والأكواد والنطاقات القديمة لا تعني إعادة تسميتها أو امتلاك نطاق جديد.
<!-- /CLIQO-BRAND-UPDATE -->

**Updated:** 24 October 2026. This is the implementation brief for the website currently being built. It is not permission to buy services or publish.

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

All sold stands have NFC and QR pointing to the **same unique CliQo URL**. A customer owns their stand in a private dashboard. Single-use customers can change the allowed destination within the purpose printed on the stand; All-in-One customers can manage their page. Catalog architecture supports the six-product family: stand, flat square square pad, PVC smart card, book-opening wallet, magnetic wallet and round NFC keychain/medallion. Show unfinished products as planned, and enable purchase for each only after its sample, price, stock and fulfillment are approved. Metal card is later.

**Smart-item model — founder decision, 25 October 2026:** Every unit has a unique preprinted dynamic QR and one stable CliQo URL. Custom-design buyers provide an initial destination in checkout; CliQo sets that destination and writes/tests NFC with the stable URL before shipping. Ready-template buyers claim the item with a private code, configure the destination and write NFC themselves using short PDF/video instructions. The public QR scan never proves ownership. Supported stand, square pad and card faces can point to a multi-link landing page; owners may reuse one page across their items or create separate pages. Their dashboard shows total URL opens and action clicks, plus pause/resume. QR and NFC share the same URL, so no source split in first-release analytics. See `Plan.md` for the revised phases and acceptance gates.

## Updated sales scope — founder decision, 25 October 2026

Build a direct multi-product catalog, cart and guest checkout. Show all six products, but enable purchase only for approved, ready SKUs. Buyers choose card payment through a hosted gateway or cash on delivery (COD) where the shipping company supports it. Add a private CliQo CRM dashboard for orders, customers, design approvals, SKU inventory, fulfillment, shipment tracking and COD settlement. Merchant activation follows purchase and preparation of a stand. The store gateway collects only CliQo product sales; a merchant's Payment stand opens that merchant's printed InstaPay or Vodafone Cash method and needs phone testing, not the store gateway. No payment option for a SKU until its sample, price, stock, shipping, policies and provider accounts are approved. Follow the updated phases in `Plan.md`; older inquiry-only wording is superseded.

## Engineering contract

- Use **Next.js App Router, TypeScript, Tailwind CSS, and Supabase Postgres/Auth/Storage**. Develop against local Supabase. The planned Hostinger KVM2 will host Next.js and self-hosted Supabase after purchase and resource review. Follow current Supabase SSR guidance.
- The existing `/s/[id]` is a stand-only prototype. Choose one permanent generic item route on the final CliQo domain before printing a sale QR. Single-link experiences use a non-permanent, no-store redirect; multi-link experiences render published page content. Never cache editable destinations as permanent redirects.
- Use opaque item IDs and one private activation flow. QR/NFC public URLs must never contain a login or activation secret. A scan identifies the item; only a private code or secure order proof claims it.
- Enforce row-level ownership for owners, items, pages, links, uploads and analytics. The browser must never receive secret/service-role keys. Public reads expose only approved published content.
- Validate each destination against the stand's printed type and safely handle bad or unknown links. CliQo must not collect visitor payment credentials or process the actual transfer.
- Keep the public route resilient and small. Log errors and check uptime. Configure production SMTP before onboarding merchants.
- Keep source code and migrations in Git. Pin package versions and commit lockfiles. Do not create Supabase resources, purchase plans, or deploy until the appropriate build/deployment step is requested.

## Content and brand contract

Use **CliQo | كليكو** and the exact slogan **One Click .. You’re There**. Use Deep Green `#003A31`, Orange `#FF6A00`, Warm Cream `#FFF6E8`, Soft White `#FAFAF8`, Soft Gray `#E6E8EB`; ITC Avant Garde Gothic Pro Bold for English and Forma DJR Arabic Deck Medium for Arabic. Follow the original supplied CliQo logo references: rounded forms, C signal, Q pointer and two separate dots beneath ي. Generated brand-book mockups are visual concepts; retain editable vector artwork for implementation. Copy uses clear Egyptian Arabic and accurate English product terms. The first two months of acquisition are organic POV demonstration and outreach, with honest gifted-product feedback; no paid ads are scheduled.

The founder designs the product, buys NFC and collects factory orders. CliQo programs NFC for custom designs; buyers program NFC for ready templates using the supplied guide. Reported stand body/base/print cost is 40 EGP and NFC+adhesive about 10 EGP, before packaging, shipping, labor and platform costs. Do not display a selling price or subscription policy until approved. `rank1eg.com` belongs to the earlier naming research and was unregistered at the last check. No CliQo domain or handle has been verified or purchased.

Use real product photography when available. Label generated concepts clearly. No fake QR codes presented as live, fabricated reviews or ratings, untested tracker/Find My claims, or claim that CliQo executes payments. Allow merchant-provided logo/design files; CliQo design service is a separate fee and includes one revision round, per `../product.md`.

## Deliverable and proof

Build in the stages in `Plan.md`. At each stage provide the actual files changed, screenshots for desktop/mobile, links or a local preview, and the check results. Before shipping: demonstrate owner isolation, private claim, edits reflecting at the same printed URL, custom and self-programmed NFC on actual phones, shared and separate landing pages, opens/click analytics, pause/resume, a safe invalid-link state, successful email invitation and a recoverable backup. Product sales and deployment remain gated by the conditions in `../tech-stack.md`.
