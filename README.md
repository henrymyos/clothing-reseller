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
4. **Price**: one more call prices the item off the matched listings. These are live asking
   prices (Depop doesn't expose sold prices), so the suggestion is capped just above the
   closest matches' median and the range is the middle half of the matched prices.
5. **Listing** (`src/lib/depop.ts`): everything is editable; the Depop description (headline,
   pitch, size, measurements, condition + flaws, material, ≤5 hashtags) is rebuilt live and
   copied in one tap. Shipping weight and fee/profit math use editable Depop US defaults.

## Models

`src/lib/model.ts` tries Claude Haiku, then free-tier fallbacks. On the AI Gateway's free tier
Claude isn't available, so calls run on Gemini Flash Lite; refused models are remembered for
15 minutes, rate limits get one quick retry, and every call has a time limit so a stuck
request can't exceed the 60s function limit.
