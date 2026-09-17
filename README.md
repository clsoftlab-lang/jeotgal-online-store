# 갯마을 젓갈 — Premium Jeotgal Online Store (DEMO)

A premium e-commerce demo for **jeotgal** (젓갈, Korean salted/fermented seafood), sourcing
from fishing-village artisans who lack online sales channels — packaged for domestic and
overseas delivery. It is a **no-build static site** (plain HTML + CSS + ES-module JS) that runs
directly in the browser and deploys to GitHub Pages with no toolchain.

**LIVE DEMO: https://clsoftlab-lang.github.io/jeotgal-online-store/**

Korean documentation: see [README.ko.md](./README.ko.md).

---

## What it is

An artisan-first storefront that gives small coastal producers a channel to sell premium
salted seafood. Browse a 26-product catalog by type, origin, spiciness and use; read each
product's artisan story, origin/storage info and reviews; build custom gift sets; add items to
a cart; and run a working **domestic/overseas shipping-fee calculator** before a simulated
checkout.

## Features

- **Catalog** — 26 fictional products with filters (type / origin / spice level / use), full-text
  search, and sorting (featured, price, rating, name).
- **Product detail** — artisan origin story, origin country + storage instructions, weight
  options with per-option pricing, star ratings and reviews.
- **Gift sets** — 4 curated preset boxes, plus a **custom gift-set builder**: pick any
  gift-eligible jeotgal, see the live price (items + box fee), and add the whole set to the cart.
- **Cart + simulated checkout** — quantity control, per-line removal, order summary, mock payment
  with a generated order number.
- **Shipping-fee calculator** (`shipping.js`, a pure module) — domestic weight tiers
  (≤1/≤5/≤10/>10 kg), free-shipping threshold, cold-chain and Jeju/remote-island surcharges;
  overseas by zone (Asia / Americas / Europe / Oceania) with base + per-kg pricing.
- **Artisans** — profiles of five fictional fishing-village masters.
- **Wishlist (찜)** — save favorites, persisted locally.
- **Responsive** mobile-first layout, **light + dark** via `prefers-color-scheme`, inline-SVG
  artwork only (no binary images), state in `localStorage` with try/catch + a reset button.

### How the gift-set builder works

Presets are defined in `data/giftsets.json` as lists of product ids plus a box fee. The custom
builder lets you toggle any `giftEligible` product; it sums the minimum price of each chosen item
and adds a fixed box fee, updating the total live. Adding the set expands it into individual cart
lines so shipping weight is computed correctly.

### How the shipping calculator works

`shipping.js` is a **pure** function module (no DOM / no storage). `calcShipping({subtotal,
totalGrams, destination, coldChain, jeju, zone})` returns `{ fee, free, breakdown }`.
Domestic fees come from weight tiers; orders at/above the free threshold waive the base fee but
keep cold-chain and Jeju surcharges. Overseas fees are `zone.base + ceil(kg) * zone.perKg`
(+ cold-chain surcharge), never free. `summarizeWeight(lines)` aggregates cart weight and
cold-chain status. All of this is unit-tested in `check.mjs`.

## Run locally

No build step. Serve the folder over HTTP (ES modules + `fetch` need `http://`, not `file://`):

```bash
python -m http.server 9008
# then open http://localhost:9008/
```

Run the checks (JSON parsing, `node --check` on all JS, index.html containers, shipping unit tests):

```bash
node check.mjs
```

## Files

```
index.html          UI shell + all view containers
styles.css          responsive light/dark styles
app.js              app logic, rendering, routing (ES module)
shipping.js         pure shipping-fee calculator + weight summary
storage.js          safe localStorage wrapper (try/catch + reset)
svg.js              inline-SVG product/artisan artwork
data/products.json  26 fictional products
data/artisans.json  5 fictional artisans
data/giftsets.json  4 gift-set presets
check.mjs           CI checks + shipping unit tests
.github/workflows/ci.yml   runs `node check.mjs`
```

## DEMO-MODE boundaries

**This is a demonstration only. Read these boundaries before assuming anything is real:**

- **All products, artisans, prices, reviews and villages are fictional** — no real brand,
  person, or trademark is represented.
- **Payment is simulated.** No real transaction, card, or money movement occurs; "결제" only
  generates a fake order number.
- **Shipping fees are illustrative** demo values, not real carrier rates or cold-chain logistics.
- **State lives in your browser's `localStorage`, not a database.** Clearing site data or using
  another device/browser resets everything. There is a reset button in the footer.
- **No accounts, no login, no personal data (PII) is collected or stored.**
- A real production build would add: a backend + real database, a verified catalog and inventory,
  a real payment gateway, authenticated accounts, and genuine cold-chain shipping integration.

## 아이디어 출처 / Idea origin

The seed idea came from the entrepreneurship class taught by Dr. Lee Il-guk at Yongin University
(용인대학교). The students' startup ideas were exceptionally creative; this is one of the standout
ideas from that class, finally brought to life as a working service — with admiration and
gratitude to those students. No student personal information is included.

## Contributors

- Dr. Lee Il-guk (이일국)
- LWJ
- LMJ
- Claude

## License

- Code: **Apache-2.0** — see [LICENSE](./LICENSE).
- Documentation: **CC BY 4.0**.
- SPDX headers: `Apache-2.0` · Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국).

---

*Not an official Anthropic product.*
