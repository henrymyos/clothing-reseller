import { generateObject } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { analysisSchema, pricingSchema, type AnalyzeResponse } from "@/lib/schema";
import { getEbayComps } from "@/lib/ebay";

// Vision model routed through the Vercel AI Gateway (needs AI_GATEWAY_API_KEY locally,
// or OIDC when running on Vercel / via `vercel dev`).
const MODEL = "anthropic/claude-haiku-4-5";

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are an expert secondhand clothing reseller who sells on both Depop and eBay.
Given a photo of a single clothing item, identify it and produce a complete resale listing analysis.

Pricing: estimate realistic recent SOLD prices on the US secondhand market in USD — not retail, not wishful asking prices. Factor in brand desirability, condition, and current demand. Keep the range tight and honest.

Platform guidance:
- Depop: trendy, streetwear, vintage, Y2K, designer-adjacent, "aesthetic" pieces aimed at a young (Gen Z) audience. Lower-to-mid price points, fashion-forward.
- eBay: established/mainstream brands, formalwear, outerwear, collectibles, rare or higher-value items, and anything that benefits from a large buyer pool and search traffic.
- "both": pieces that genuinely sell well on either.

If the image is unclear or the item is hard to identify, lower your confidence and widen the price range rather than guessing wildly.`;

export async function POST(req: NextRequest) {
  try {
    const { image } = (await req.json()) as { image?: string };

    if (!image || !image.startsWith("data:image/")) {
      return NextResponse.json(
        { error: "A valid image (data URL) is required." },
        { status: 400 }
      );
    }

    // 1. Identify the item and produce a first-pass analysis + an eBay search query.
    const { object: analysis } = await generateObject({
      model: MODEL,
      schema: analysisSchema,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyze this clothing item for resale and fill out the listing analysis.",
            },
            { type: "image", image },
          ],
        },
      ],
    });

    // 2. Pull real comparable prices from eBay (active listings). Non-fatal if it fails.
    let marketData = null;
    try {
      marketData = await getEbayComps(analysis.ebaySearchQuery);
    } catch (e) {
      console.error("eBay lookup failed:", e);
    }

    // 3. If we have real comps, re-price the item grounded on that data.
    if (marketData) {
      try {
        const { object: pricing } = await generateObject({
          model: MODEL,
          schema: pricingSchema,
          system:
            "You price secondhand clothing for resale. Given an item and live eBay comps (current active listings, which tend to run slightly above final sold prices), set a realistic price to sell reasonably quickly. Discard obvious outliers and unrelated results.",
          prompt: `Item: ${analysis.title} — brand ${analysis.brand}, condition ${analysis.condition}, type ${analysis.itemType}.
Your earlier estimate: $${analysis.priceLow}–$${analysis.priceHigh} (suggested $${analysis.suggestedPrice}).
Live eBay comps for "${analysis.ebaySearchQuery}": ${marketData.sampleSize} listings, 10th pct $${marketData.low}, median $${marketData.median}, 90th pct $${marketData.high}.
Sample listings: ${marketData.samples.map((s) => `"${s.title}" $${s.price}`).join("; ")}.
Return a final price range and suggested price in USD.`,
        });
        analysis.priceLow = pricing.priceLow;
        analysis.priceHigh = pricing.priceHigh;
        analysis.suggestedPrice = pricing.suggestedPrice;
        analysis.priceReasoning = pricing.priceReasoning;
      } catch (e) {
        console.error("Re-pricing failed, keeping model estimate:", e);
      }
    }

    const response: AnalyzeResponse = { ...analysis, marketData };
    return NextResponse.json(response);
  } catch (err) {
    console.error("Analyze error:", err);
    const message =
      err instanceof Error ? err.message : "Something went wrong analyzing the image.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
