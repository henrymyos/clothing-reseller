import { generateObject } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { analysisSchema, pricingSchema, type AnalyzeResponse } from "@/lib/schema";
import { getDepopComps, quantile } from "@/lib/comps";
import { withModelFallback } from "@/lib/model";
import { MAX_HASHTAGS, cleanHashtag } from "@/lib/depop";
import { cleanSales, matchMySales } from "@/lib/sales";

export const maxDuration = 60;

const MAX_PHOTOS = 6;

const SYSTEM_PROMPT = `You are an expert Depop seller who lists secondhand clothing.
You get one to six photos of a single item — typically front, back, the brand/size/care tags, and close-ups of any flaws — and fill in everything Depop's listing form needs.

Read the tags carefully: the brand tag, the size tag and the care/content tag are the source of truth for brand, size and material. Only report a size from a tag if you can actually read its characters — a neck tag that's too small, blurry or turned away counts as not visible. If neither a legible tag nor the seller's notes give the size, say 'Not visible' rather than guessing.
Look at every photo for wear: stains, holes, pilling, fading, cracked prints, stretched collars, missing buttons. List each one with its location, and set the condition conservatively.

Pricing: estimate what this sells for on Depop in the US — realistic sold prices, not retail and not hopeful asking prices. Blank-brand garments (Gildan, Hanes, etc.) are priced on the graphic, not the brand.
The description is for Depop: casual, specific, no keyword stuffing, no hashtags in the body.`;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { images?: unknown; image?: unknown; description?: unknown; sales?: unknown };
    // Accept the old single-image shape too, so a cached client keeps working.
    const raw = Array.isArray(body.images) ? body.images : body.image ? [body.image] : [];
    const images = raw.filter((i): i is string => typeof i === "string" && i.startsWith("data:image/")).slice(0, MAX_PHOTOS);
    if (!images.length) {
      return NextResponse.json({ error: "Add at least one photo of the item." }, { status: 400 });
    }
    const sellerNotes = typeof body.description === "string" ? body.description.trim().slice(0, 500) : "";

    // 1. Read the item from every photo.
    const { object: analysis } = await withModelFallback((model, abortSignal) =>
      generateObject({
        model,
        abortSignal,
        schema: analysisSchema,
        system: SYSTEM_PROMPT,
        temperature: 0.2,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Here ${images.length === 1 ? "is 1 photo" : `are ${images.length} photos`} of one item for a Depop listing.${
                  sellerNotes
                    ? `\n\nThe seller adds (trust these for facts the photos can't show — brand, size, era, flaws, measurements): ${sellerNotes}`
                    : ""
                }`,
              },
              ...images.map((image) => ({ type: "image" as const, image })),
            ],
          },
        ],
      })
    );
    analysis.hashtags = [...new Set(analysis.hashtags.map(cleanHashtag).filter(Boolean))].slice(0, MAX_HASHTAGS);
    // A size "from the tag" must come with the text actually read off it — a wrong
    // size on a listing means a return, so an unquoted guess becomes "Not visible".
    if (analysis.sizeSource === "tag" && !analysis.sizeTagText.trim()) {
      analysis.size = "Not visible";
      analysis.sizeSource = "unknown";
    }

    // 2. Matched Depop comps (non-fatal if the search fails).
    let comps: AnalyzeResponse["comps"] = null;
    try {
      comps = await getDepopComps(analysis);
    } catch (e) {
      console.error("Depop comps lookup failed:", e);
    }

    // 3. The seller's own sold items like this one (her real sold prices).
    const sales = cleanSales(body.sales);
    const mySales = sales.length ? matchMySales(analysis, sales) : null;
    const hasMine = !!mySales && (mySales.matches.length > 0 || mySales.familyMedian != null);

    // 4. Re-price on her sales + the matched Depop listings.
    if (comps || hasMine) {
      try {
        const mineBlock = mySales && hasMine
          ? `The seller's OWN past sales — real SOLD prices from her shop, the strongest signal:
${mySales.matches.length ? mySales.matches.map((s) => `- [${s.similarity}] sold "${s.title}"${s.brand ? ` (${s.brand})` : ""}${s.size ? ` size ${s.size}` : ""} for $${s.price}${s.date ? ` on ${s.date}` : ""}`).join("\n") : "- none closely matching"}
${mySales.familyMedian != null ? `Her typical sold price for this kind of garment: $${mySales.familyMedian} (median of ${mySales.familyCount}).` : ""}`
          : "";
        const compsBlock = comps
          ? `${comps.sampleSize} matching Depop listings — current ASKING prices, which run above what items sell for (low $${comps.low}, median $${comps.median}, high $${comps.high}):
${comps.listings.map((l) => `- [${l.similarity}] ${l.brand} "${l.title}" size ${l.size ?? "?"} $${l.price}`).join("\n")}`
          : "";
        const { object: pricing } = await withModelFallback(
          (model, abortSignal) =>
          generateObject({
            model,
            abortSignal,
            maxRetries: 0,
            schema: pricingSchema,
            system:
              "You price secondhand clothing for one Depop seller. Her own past sold prices are real outcomes for her shop and audience — trust them most. Other Depop listings are asking prices that run above sold prices, so price a little under their median. Adjust for this item's condition and size, and weight closer matches more. Write the reasoning to the seller directly, in one sentence using 'you'/'your' (e.g. 'Your 2 similar Gildan hoodies sold for $13–15, and matching Depop listings ask about $10.').",
            prompt: `Item: ${analysis.headline} — ${analysis.brand} ${analysis.itemType}, condition ${analysis.condition}, size ${analysis.size}${
              analysis.visibleFlaws.length ? `, flaws: ${analysis.visibleFlaws.join("; ")}` : ""
            }.
First estimate from the photos: $${analysis.priceLow}–$${analysis.priceHigh} (suggested $${analysis.suggestedPrice}).
${mineBlock}
${compsBlock}
Return the final range and suggested price in USD, citing her sales when they exist.`,
          }),
          { timeoutMs: 12_000 }
        );
        // Anchor: her own matched sold prices when she has 2+, else the closest Depop
        // matches (asking prices run high, so the cap sits just above them).
        const myPrices = (mySales?.matches ?? []).map((s) => s.price).sort((x, y) => x - y);
        const close = (comps?.listings ?? []).filter((l) => l.similarity >= 85).map((l) => l.price).sort((x, y) => x - y);
        const anchor = myPrices.length >= 2 ? quantile(myPrices, 0.5)
          : comps ? (close.length >= 3 ? quantile(close, 0.5) : comps.median)
          : mySales?.familyMedian ?? null;
        const cap = anchor != null ? Math.round(anchor * (myPrices.length >= 2 ? 1.2 : 1.1)) : Infinity;
        const suggested = Math.max(1, Math.min(Math.round(pricing.suggestedPrice), cap));
        // The range is the middle half of her matched sales (or the Depop matches), always containing the suggestion.
        const band = myPrices.length >= 2 ? myPrices : comps ? comps.listings.map((l) => l.price).sort((x, y) => x - y) : [];
        analysis.suggestedPrice = suggested;
        analysis.priceLow = band.length ? Math.min(Math.round(quantile(band, 0.25)), suggested) : Math.min(Math.round(pricing.priceLow), suggested);
        analysis.priceHigh = band.length ? Math.max(Math.round(quantile(band, 0.75)), suggested) : Math.max(Math.round(pricing.priceHigh), suggested);
        analysis.priceReasoning = pricing.priceReasoning;
      } catch (e) {
        console.error("Re-pricing failed, keeping the photo estimate:", e);
      }
    }

    const response: AnalyzeResponse = { ...analysis, comps, mySales: hasMine ? mySales : null, photoCount: images.length };
    return NextResponse.json(response);
  } catch (err) {
    console.error("Analyze error:", err);
    const message = err instanceof Error ? err.message : "Something went wrong analyzing the photos.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
