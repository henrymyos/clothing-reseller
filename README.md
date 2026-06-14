# SnapList

Photograph a clothing item → get the **best platform** to sell it on (Depop, eBay, or both), a **price estimate**, and a **ready-to-post listing** (title, description, brand, condition, tags).

Built with Next.js (App Router) + the Vercel AI SDK, using a Claude vision model through the Vercel AI Gateway.

## Setup

1. Get a Vercel AI Gateway key from your [Vercel dashboard](https://vercel.com) (AI Gateway tab).
2. Copy the env file and paste your key:
   ```bash
   cp .env.local.example .env.local
   # then edit .env.local and set AI_GATEWAY_API_KEY=...
   ```
3. Run it:
   ```bash
   npm run dev
   ```
4. Open http://localhost:3000, take/upload a photo, hit **Analyze**.

## How it works

- `src/app/page.tsx` — upload/camera UI and results display.
- `src/app/api/analyze/route.ts` — sends the photo to the vision model and returns structured JSON.
- `src/lib/schema.ts` — the Zod schema that defines (and validates) the analysis: platform, price range, description, etc.

## eBay market data

When `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` are set, the app queries the **eBay Browse API**
for comparable current listings, then re-prices the item grounded on that real data and shows
the comps in the UI. Without the keys it falls back to a pure AI estimate.

To get keys: create an app at [developer.ebay.com](https://developer.ebay.com), then use your
**Production** App ID (Client ID) and Cert ID (Client Secret).

> Note: the Browse API returns **active** listings (current asking prices), which run slightly
> above final sold prices — the model accounts for this. For true **sold** prices, eBay's
> Marketplace Insights API exists but requires special approval; if you're granted access, swap
> the URL/scope in `src/lib/ebay.ts` (the response shape is the same).

## Next steps

- Push listings directly to Depop/eBay via their APIs, save listing history, batch-analyze
  multiple photos, or add background removal for cleaner listing images.

## Deploy

```bash
npx vercel
```

On Vercel the AI Gateway is wired up automatically (no key needed in env).
