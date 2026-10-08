import { generateObject } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { analysisSchema, pricingSchema, type AnalyzeResponse } from "@/lib/schema";
import { getDepopComps, type SearchStatus } from "@/lib/comps";
import { withModelFallback } from "@/lib/model";
import { clientIp, rateLimited } from "@/lib/rateLimit";
import { HASHTAG_BANK, enrichHeadline, pickHashtags } from "@/lib/depop";
import { cleanSales, matchMySales } from "@/lib/sales";
import { explainPrice, finalPrice, priceAnchor, type PriceBasis } from "@/lib/pricing";
import { PRICE_CHECK_SKIPPED, friendlyError, modelNotice, searchNotice } from "@/lib/notices";

export const maxDuration = 60;

const MAX_PHOTOS = 6;

const SYSTEM_PROMPT = `You are an expert Depop seller who lists secondhand clothing.
You get one to six photos of a single item — typically front, back, the brand/size/care tags, and close-ups of any flaws — and fill in everything Depop's listing form needs.

Read the tags carefully: the brand tag, the size tag and the care/content tag are the source of truth for brand, size and material. Only report a size from a tag if you can actually read its characters — a neck tag that's too small, blurry or turned away counts as not visible. If neither a legible tag nor the seller's notes give the size, say 'Not visible' rather than guessing.
Look at every photo for wear: stains, holes, pilling, fading, cracked prints, stretched collars, missing buttons. List each one with its location, and set the condition conservatively.

Pricing: estimate what this sells for on Depop in the US — realistic sold prices, not retail and not hopeful asking prices. Blank-brand garments (Gildan, Hanes, etc.) are priced on the graphic, not the brand.
Descriptions follow the seller's own style — a keyword-rich first line, then the size, then any flaws — with 5 one-word hashtags. Real examples from her shop:
- "Croft & Barrow mocha brown cable knit quarter zip sweater" · #cable #grandma #preppy #cottage #cottagecore
- "Van Heusen gray skater casual boxy fit quarter zip with black horizontal stripes" · #casual #striped #indie #skater #retro
- "Volcom vintage 2007 dark gray y2k skater concert graphic polo shirt" · #y2k #vintage #skater #grunge #surfer
- "Amazon Essentials black waffle knit thermal long sleeve shirt" · #indie #grunge #skater #thermal #winter
Hashtags come only from her word bank: ${HASHTAG_BANK.join(", ")}. Pick the 5 that best fit the item.
Write first lines like these, but work in more of the words a buyer would actually search for this exact piece — always at least two style words (indie, skater, surfer, grunge, y2k, vintage, preppy, cottagecore, granola, workwear, casual…) plus fit, era, fabric or item synonyms — while keeping it readable. If the seller's notes describe the item, use them as facts but still write a fuller, keyword-rich first line.`;

export async function POST(req: NextRequest) {
  // 60 items an hour is far more than she'd ever list; a script would hit it fast.
  if (rateLimited(clientIp(req.headers), 60, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many items analyzed in the last hour — try again in a bit." }, { status: 429 });
  }
  try {
    const body = (await req.json()) as { images?: unknown; image?: unknown; description?: unknown; sales?: unknown };
    // Accept the old single-image shape too, so a cached client keeps working.
    const raw = Array.isArray(body.images) ? body.images : body.image ? [body.image] : [];
    const images = raw.filter((i): i is string => typeof i === "string" && i.startsWith("data:image/")).slice(0, MAX_PHOTOS);
    if (!images.length) {
      return NextResponse.json({ error: "Add at least one photo of the item." }, { status: 400 });
    }
    const sellerNotes = typeof body.description === "string" ? body.description.trim().slice(0, 500) : "";

    // Anything worked around along the way is reported back, never applied silently.
    const notices: string[] = [];
    const modelsUsed: string[] = [];
    const onModel = (m: string) => { modelsUsed.push(m); };

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
      }),
      { onModel }
    );
    // Always exactly 5, always from her word bank.
    analysis.hashtags = pickHashtags(analysis.hashtags, {
      styles: analysis.styles, age: analysis.age,
      text: `${analysis.headline} ${analysis.itemType} ${analysis.distinctiveFeatures.join(" ")} ${analysis.material}`,
    });
    analysis.headline = enrichHeadline(analysis.headline, [...analysis.styles, ...analysis.hashtags, analysis.age === "Modern" ? "" : "vintage"], analysis.colors[0]);
    // A size "from the tag" must come with the text actually read off it — a wrong
    // size on a listing means a return, so an unquoted guess becomes "Not visible".
    if (analysis.sizeSource === "tag" && !analysis.sizeTagText.trim()) {
      analysis.size = "Not visible";
      analysis.sizeSource = "unknown";
    }

    // 2. Matched Depop comps (non-fatal if the search fails — but she's told).
    let comps: AnalyzeResponse["comps"] = null;
    let search: SearchStatus;
    try {
      ({ comps, search } = await getDepopComps(analysis));
    } catch (e) {
      console.error("Depop comps lookup failed:", e);
      search = { state: "failed", detail: e instanceof Error ? e.message.slice(0, 160) : "search error" };
    }

    // 3. The seller's own sold items like this one (her real sold prices).
    const sales = cleanSales(body.sales);
    const mySales = sales.length ? matchMySales(analysis, sales) : null;
    const hasMine = !!mySales && (mySales.matches.length > 0 || mySales.familyMedian != null);
    const searchMsg = searchNotice(search, hasMine);
    if (searchMsg) notices.push(searchMsg);

    // 4. Re-price on her sales + the matched Depop listings.
    let priceBasis: PriceBasis = "photos";
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
            temperature: 0, // the same item should get the same price run to run
            schema: pricingSchema,
            system: hasMine
              ? "You price secondhand clothing for one Depop seller. Her own past sold prices are real outcomes for her shop and audience — trust them most. Other Depop listings are asking prices that run above sold prices, so price a little under their median. Adjust for this item's condition and size, and weight closer matches more."
              : "You price secondhand clothing for a Depop seller. You're given Depop listings already checked to be close matches; they are asking prices that run above what items sell for, so price a little under their median. Adjust for this item's condition and size, and weight closer matches more.",
            prompt: `Item: ${analysis.headline} — ${analysis.brand} ${analysis.itemType}, condition ${analysis.condition}, size ${analysis.size}${
              analysis.visibleFlaws.length ? `, flaws: ${analysis.visibleFlaws.join("; ")}` : ""
            }.
First estimate from the photos: $${analysis.priceLow}–$${analysis.priceHigh} (suggested $${analysis.suggestedPrice}).
${mineBlock}
${compsBlock}
Return the final range and suggested price in USD, citing her sales when they exist.`,
          }),
          { timeoutMs: 12_000, onModel }
        );
        const a = priceAnchor(mySales, comps);
        const p = finalPrice(pricing.suggestedPrice, pricing.priceLow, pricing.priceHigh, a, analysis.condition);
        analysis.suggestedPrice = p.suggested;
        analysis.priceLow = p.low;
        analysis.priceHigh = p.high;
        priceBasis = a.basis;
        // The explanation is written here from the real evidence, not by the model —
        // it can't invent sales she didn't make or quote numbers that disagree with
        // the final price and range shown.
        analysis.priceReasoning = explainPrice(mySales, comps, analysis.visibleFlaws, analysis.condition);
      } catch (e) {
        // The AI check failed: still hold the photo estimate to her sales and the
        // listings (same floor, cap and range), and say that's what happened.
        console.error("Re-pricing failed, anchoring the photo estimate directly:", e);
        const a = priceAnchor(mySales, comps);
        const p = finalPrice(analysis.suggestedPrice, analysis.priceLow, analysis.priceHigh, a, analysis.condition);
        analysis.suggestedPrice = p.suggested;
        analysis.priceLow = p.low;
        analysis.priceHigh = p.high;
        priceBasis = a.basis;
        analysis.priceReasoning = explainPrice(mySales, comps, analysis.visibleFlaws, analysis.condition);
        notices.push(PRICE_CHECK_SKIPPED);
      }
    }

    const modelMsg = modelNotice(modelsUsed);
    if (modelMsg) notices.unshift(modelMsg);
    const response: AnalyzeResponse = { ...analysis, comps, mySales: hasMine ? mySales : null, priceBasis, notices, photoCount: images.length };
    return NextResponse.json(response);
  } catch (err) {
    console.error("Analyze error:", err);
    return NextResponse.json({ error: friendlyError(err) }, { status: 500 });
  }
}
