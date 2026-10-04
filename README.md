# SnapList

Snap a clothing item → get a **ready-to-post Depop listing**: description with hashtags,
measurements, condition and flaws, every field Depop's Sell form asks for, a price grounded
on matching Depop listings, packed weight, and your take-home profit after fees.

Built with Next.js (App Router) + the Vercel AI SDK, with a vision model through the Vercel
AI Gateway and Depop search via [Exa](https://exa.ai).

## Setup

```bash
vercel env pull .env.local   # AI Gateway (OIDC) + EXA_API_KEY
npm install
npm run dev                  # http://localhost:3000
npm test                     # unit tests (vitest)
```

## How it works

1. **Photos** (`src/app/page.tsx`): up to 6 — front, back, brand/size tag, care tag, flaws.
   Resized in the browser before upload.
2. **Analysis** (`src/app/api/analyze/route.ts`, `src/lib/schema.ts`): one vision call reads
   every photo and fills in Depop's fields (department, category, size, condition, colours,
   styles, age, source, material), visible flaws, weight, and search queries. A size "from
   the tag" must quote the text read off it, otherwise it's reported as not visible.
3. **Comps** (`src/lib/comps.ts`): up to three Depop searches, then each result is read from
   the structured line Depop puts on product pages (`# Brand Men's Colour Type $price Size X
   Condition`) — no AI. Fixed rules decide what counts: same garment family; same brand for
   real brands; shared design (or same blank maker) for blanks; kids only vs kids; UK £
   listings skipped; price outliers trimmed.
4. **Her sales** (`src/lib/sales.ts`): the seller imports her own Depop sales export (CSV) once;
   it's parsed in the browser, only item/brand/category/size/price/date are kept (buyer details
   are dropped), stored in localStorage, and sent with each analysis. Her sold items like this one
   are matched with the same rules and are the strongest price signal.
5. **Price**: one more call prices the item off her sales and the matched listings. These are live asking
   prices (Depop doesn't expose sold prices publicly), so the suggestion is anchored on her own
   matched sales when she has 2+, otherwise capped just above the closest Depop matches' median.
6. **Listing** (`src/lib/depop.ts`): everything is editable; the Depop description is written in
   her own format — a keyword-rich first line (colour + style words buyers search + item, topped
   up by `enrichHeadline`), `size …`, any flaws "(pictured)", optional measurements, her SKU and 5
   one-word hashtags — rebuilt live and copied in one tap. Brand, condition and material go in
   Depop's own fields, not the description. Shipping weight and fee/profit math use editable Depop US defaults
   (processing 3.3% + $0.45 on item + shipping + tax, 12% boost fee — checked against real payouts).
   "Copy row" puts the new item on the clipboard in her inventory sheet's column order.

## My shop (`/shop`)

Paste her inventory sheet from Google Sheets, link it (if shared "anyone with the link"; read
via `/api/sheet`, Google Sheets URLs only), or upload a CSV. Parsed and stored in the browser
(`src/lib/inventory.ts`, `src/lib/inventoryStore.ts`). It works out profit, return on cost and
days-to-sell per item, totals, fees (and how much boosting costs), monthly results, results by
kind of item and by sourcing trip, best/worst items, markdown suggestions for stale stock
(never below break-even), sheet problems (duplicate SKUs etc.), and a full CSV export. Sold items
from the sheet also price new listings when no Depop sales export is loaded.

The app has two tabs (`src/components/AppNav.tsx`): **List an item** (photos → listing + price)
and **My shop** — recommendations for future buying and listing (`src/lib/recommend.ts`: what to
buy more of and the most to pay, what to skip, sizes/brands that sell, pricing for offers,
boosting, restock timing, markdowns), her past orders from the sheet and the Depop export, her
stock, and the data imports. `/inventory` redirects to `/shop`.

## Models

`src/lib/model.ts` tries Claude Haiku, then free-tier fallbacks. On the AI Gateway's free tier
Claude isn't available, so calls run on Gemini Flash Lite; refused models are remembered for
15 minutes, rate limits get one quick retry, and every call has a time limit so a stuck
request can't exceed the 60s function limit.
