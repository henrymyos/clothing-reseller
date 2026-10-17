import { z } from "zod";
import { AGES, COLORS, CONDITIONS, DEPARTMENTS, HASHTAG_BANK, MEASUREMENT_KINDS, SOURCES, STYLES } from "@/lib/depop";

// What the vision model produces from the photos (+ seller notes): everything
// Depop's Sell form asks for, plus what we need to find comparable listings.
export const analysisSchema = z.object({
  headline: z
    .string()
    .describe(
      "First line of the description, in the seller's style and packed with words buyers type into Depop search: brand (skip if unbranded/blank) + colour + AT LEAST 2 (up to 4) style words buyers search that fit the piece (indie, skater, surfer, grunge, y2k, vintage, 90s, preppy, old money, cottagecore, granola, gorpcore, workwear, streetwear, casual, boxy fit, baggy…) + the item type with its common search synonyms (e.g. 'waffle knit thermal long sleeve shirt', 'crewneck sweatshirt', 'quarter zip sweater', 'carpenter jeans') + one standout detail (graphic, pattern, pockets, era). Lowercase except the brand and proper nouns; no size, condition, emojis or hashtags; 10–18 words. Never just copy the seller's notes — expand them with search words. E.g. 'Eddie Bauer gray skater surfer indie waffle knit thermal long sleeve shirt'."
    ),
  itemType: z.string().describe("Garment type, e.g. 'Hoodie', 'Denim jacket', 'Midi dress'."),
  brand: z.string().describe("Brand read from logos/tags or the seller's notes; 'Unbranded' if none, 'Unknown' if unreadable."),
  brandTier: z
    .enum(["designer", "mainstream", "blank", "unbranded"])
    .describe(
      "designer = luxury/hype labels; mainstream = recognised fashion/sport/workwear brands; blank = blank-garment makers sold for printing (Gildan, Hanes, Fruit of the Loom, Jerzees, Port & Company, Bella+Canvas…) where the graphic matters, not the brand; unbranded = no brand."
    ),
  distinctiveFeatures: z
    .array(z.string())
    .max(5)
    .describe("What makes this exact piece identifiable: graphic/print subject, text on it, logo placement, collab, wash, cut. Short phrases."),
  department: z.enum(DEPARTMENTS).describe("Depop department this should be listed under."),
  category: z.string().describe("Depop category, e.g. 'Tops', 'Bottoms', 'Coats & jackets', 'Dresses', 'Footwear', 'Accessories'."),
  subcategory: z.string().describe("Depop subcategory, e.g. 'Hoodies', 'Sweatshirts', 'T-shirts', 'Jeans', 'Jackets'."),
  size: z.string().describe("Size exactly as printed on the tag (e.g. 'M', 'US 8', '32x30'), or from the seller's notes; 'Not visible' if neither shows it."),
  sizeSource: z.enum(["tag", "notes", "estimated", "unknown"]),
  sizeTagText: z
    .string()
    .describe("The exact characters you can actually read on the size tag (e.g. 'L', 'M/M', '32 x 30'), or '' if no size tag is legible. Never fill this from a guess."),
  condition: z.enum(CONDITIONS).describe("Depop condition, judged from every photo (be conservative if wear is visible)."),
  visibleFlaws: z
    .array(z.string())
    .max(6)
    .describe("Each visible flaw with its location, e.g. 'small stain on left cuff', 'light pilling on front'. Empty if none visible."),
  colors: z.array(z.enum(COLORS)).min(1).max(2).describe("Up to two Depop colours, main colour first."),
  styles: z.array(z.enum(STYLES)).max(3).describe("Up to three Depop style tags that genuinely fit."),
  age: z.enum(AGES).describe("Depop age: 'Modern' unless the tag/construction clearly dates it."),
  source: z.enum(SOURCES).describe("Depop source — usually 'Preloved', or 'Vintage' for 20+ year old pieces, 'Deadstock' for unworn old stock."),
  material: z.string().describe("Fabric content from the care tag if visible (e.g. '80% cotton, 20% polyester'), else a best guess prefixed with 'Likely', or 'Unknown'."),
  keywords: z
    .array(z.enum(HASHTAG_BANK))
    .max(12)
    .describe("EVERY word from the seller's word bank that genuinely fits this item — style, fabric, knit/pattern, fit, era, season — ranked best first, no repeats. The top 5 become the hashtags; the rest are added to the first line as search words, so include all that fit (usually 5–10), not just 5. E.g. a cream cable knit sweater: 'cable', 'knit', 'cottagecore', 'grandma', 'preppy', 'chunky', 'cottage', 'winter'."),
  measurementKind: z.enum(MEASUREMENT_KINDS).describe("Which measurements apply: top, bottoms, shorts, dress, skirt, shoes, accessory."),
  estimatedWeightOz: z.number().describe("Item weight in ounces (without packaging), e.g. tee ~6, hoodie ~20, jeans ~22, heavy jacket ~45."),
  searchQuery: z
    .string()
    .describe("Depop search for this exact piece: brand (if not blank/unbranded) + distinctive feature + item type, e.g. 'carhartt detroit jacket brown'."),
  searchQueryBroad: z
    .string()
    .describe("A broader fallback search for close alternatives, e.g. 'carhartt work jacket'."),
  priceLow: z.number().describe("Low end of realistic Depop prices in USD for this item in this condition."),
  priceHigh: z.number().describe("High end in USD."),
  suggestedPrice: z.number().describe("Price in USD to sell within a few weeks on Depop."),
  priceReasoning: z.string().describe("One sentence on what drives the price."),
  confidence: z.enum(["high", "medium", "low"]),
});

export type Analysis = z.infer<typeof analysisSchema>;

// Re-pricing after grounding on matched Depop listings.
export const pricingSchema = z.object({
  priceLow: z.number(),
  priceHigh: z.number(),
  suggestedPrice: z.number().describe("Recommended Depop price in USD to sell within a few weeks."),
  priceReasoning: z.string().describe("One sentence to the seller, using 'you/your', citing her sales and/or the matched listings."),
});

export type CompListing = {
  title: string;
  price: number;
  url: string;
  brand: string;
  size: string | null;
  similarity: number; // 0–100, how close a match it is
  reason: string;
};

export type Comps = {
  query: string;
  sampleSize: number;
  excluded: number;   // results judged not comparable (or price outliers)
  low: number;
  median: number;
  high: number;
  listings: CompListing[];
};

export type AnalyzeResponse = Analysis & {
  hashtags: string[]; // the top 5 keywords; keywords not hashtagged are added to the headline
  comps: Comps | null;
  mySales: import("@/lib/sales").MySales | null;
  priceBasis?: import("@/lib/pricing").PriceBasis; // what the price is anchored on
  notices?: string[]; // anything SnapList had to work around (backup model, unreadable Depop pages…), shown to her
  compsNote?: string | null; // the Depop price search is down: a small note on the price card, not a banner
  photoCount: number;
};

// Array length limits in analysisSchema. Direct Gemini's structured output can't be
// told an array's length (the Google provider drops minItems/maxItems when it converts
// the schema), so an over-long list would fail validation and waste the whole call.
const ANALYSIS_ARRAY_MAX: Partial<Record<keyof Analysis, number>> = {
  distinctiveFeatures: 5,
  visibleFlaws: 6,
  colors: 2,
  styles: 3,
  keywords: 12,
};

/**
 * generateObject repair hook: if the model's JSON only broke the array length limits,
 * trim the lists and let validation run again. Returns null (no repair) otherwise.
 */
export async function trimAnalysisArrays({ text }: { text: string }): Promise<string | null> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const obj = data as Record<string, unknown>;
  let changed = false;
  for (const [key, max] of Object.entries(ANALYSIS_ARRAY_MAX)) {
    const v = obj[key];
    if (Array.isArray(v) && v.length > (max as number)) {
      obj[key] = v.slice(0, max);
      changed = true;
    }
  }
  return changed ? JSON.stringify(obj) : null;
}
