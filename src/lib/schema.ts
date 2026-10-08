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
  hashtags: z
    .array(z.enum(HASHTAG_BANK))
    .max(5)
    .describe("Exactly 5 different hashtags from the seller's word bank — the 5 that best match this item's style, fabric, pattern, era and season (e.g. a gray waffle thermal: 'thermal', 'indie', 'skater', 'grunge', 'winter'; a cream cable knit sweater: 'cable', 'knit', 'cottagecore', 'grandma', 'preppy')."),
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
  comps: Comps | null;
  mySales: import("@/lib/sales").MySales | null;
  priceBasis?: import("@/lib/pricing").PriceBasis; // what the price is anchored on
  notices?: string[]; // anything SnapList had to work around (backup model, search down…), shown to her
  photoCount: number;
};
