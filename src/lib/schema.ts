import { z } from "zod";

export const analysisSchema = z.object({
  title: z
    .string()
    .describe(
      "A catchy, search-optimized listing title (max ~80 chars) a reseller would use, e.g. 'Vintage Nike Embroidered Swoosh Hoodie - Grey M'"
    ),
  description: z
    .string()
    .describe(
      "A short, appealing 2-3 sentence listing description highlighting style, fit, condition and standout details."
    ),
  itemType: z.string().describe("Type of garment, e.g. 'Hoodie', 'Denim Jacket', 'Midi Dress'."),
  brand: z
    .string()
    .describe("Best guess of the brand from logos/tags/style, or 'Unbranded' / 'Unknown' if not identifiable."),
  condition: z
    .enum(["New with tags", "Like new", "Excellent", "Good", "Fair", "Worn"])
    .describe("Estimated condition based on visible wear in the photo."),
  color: z.string().describe("Primary color(s)."),
  material: z.string().describe("Likely material if discernible, otherwise 'Unknown'."),
  size: z.string().describe("Visible size if shown on a tag, otherwise 'Not visible'."),
  tags: z
    .array(z.string())
    .max(8)
    .describe("Up to 8 short search keywords/hashtags buyers would use (no '#')."),

  ebaySearchQuery: z
    .string()
    .describe(
      "A concise eBay search query that would surface comparable listings for this exact item — e.g. 'Nike vintage embroidered swoosh hoodie grey'. Brand + key descriptors, no condition words."
    ),

  platform: z
    .enum(["depop", "ebay", "both"])
    .describe(
      "Best platform to list on. Depop favors trendy/streetwear/vintage/Y2K/aesthetic items for a younger audience; eBay favors established brands, collectibles, formalwear, and higher-value or hard-to-find items with broad reach."
    ),
  platformReasoning: z
    .string()
    .describe("One or two sentences explaining the platform choice for this specific item."),

  currency: z.literal("USD"),
  priceLow: z.number().describe("Typical low end of recent resale prices in USD."),
  priceHigh: z.number().describe("Typical high end of recent resale prices in USD."),
  suggestedPrice: z.number().describe("Recommended listing price in USD to sell reasonably quickly."),
  priceReasoning: z
    .string()
    .describe("One sentence explaining the price range (brand desirability, condition, demand)."),

  confidence: z
    .enum(["high", "medium", "low"])
    .describe("How confident you are overall, given image quality and how identifiable the item is."),
});

export type Analysis = z.infer<typeof analysisSchema>;

// Refined pricing produced after grounding on real eBay comps.
export const pricingSchema = z.object({
  priceLow: z.number().describe("Realistic low end in USD, ignoring obvious outliers in the comps."),
  priceHigh: z.number().describe("Realistic high end in USD, ignoring obvious outliers."),
  suggestedPrice: z
    .number()
    .describe("Recommended listing price in USD to sell reasonably quickly given the comps."),
  priceReasoning: z
    .string()
    .describe("One sentence citing the live comps (e.g. 'median of 24 active listings is $38')."),
});

export type Pricing = z.infer<typeof pricingSchema>;

// Real market data pulled from eBay. Defined here (no server deps) so the client can import the type.
export type MarketSample = { title: string; price: number; url: string };

export type MarketData = {
  source: "ebay-active" | "ebay-sold";
  sampleSize: number;
  currency: string;
  low: number;
  median: number;
  high: number;
  samples: MarketSample[];
};

export type AnalyzeResponse = Analysis & { marketData: MarketData | null };
