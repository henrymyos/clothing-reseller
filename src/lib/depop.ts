// Depop listing vocabulary + the pure helpers the app uses to turn an analysis
// into a ready-to-paste Depop listing. No server or React deps, so both the API
// route and the client can import it (and it's unit-tested in tests/).

// The options Depop's "Sell" form offers (US). Kept as plain lists so the model
// can be constrained to them and the UI can render them as pickers.
export const CONDITIONS = ["Brand new", "Like new", "Used - Excellent", "Used - Good", "Used - Fair"] as const;
export type Condition = (typeof CONDITIONS)[number];

export const DEPARTMENTS = ["Men", "Women", "Kids"] as const;

export const COLORS = [
  "Black", "Grey", "White", "Cream", "Tan", "Brown", "Khaki", "Green", "Blue", "Navy",
  "Purple", "Pink", "Red", "Burgundy", "Orange", "Yellow", "Silver", "Gold", "Multi",
] as const;

export const STYLES = [
  "Streetwear", "Vintage", "Y2K", "Casual", "Sportswear", "Workwear", "Utility", "Skater",
  "Grunge", "Goth", "Punk", "Emo", "Preppy", "Minimalist", "Boho", "Western", "Indie",
  "Retro", "Cottagecore", "Coquette", "Coastal", "Techwear", "Loungewear", "Party", "Avant garde",
] as const;

export const AGES = ["Modern", "00s", "90s", "80s", "70s", "60s", "50s", "Antique"] as const;

export const SOURCES = [
  "Preloved", "Vintage", "Deadstock", "Designer", "Repaired", "Reworked / Upcycled", "Custom", "Handmade",
] as const;

// Which flat measurements buyers expect for each kind of item.
export const MEASUREMENT_KINDS = ["top", "bottoms", "dress", "skirt", "shorts", "shoes", "accessory"] as const;
export type MeasurementKind = (typeof MEASUREMENT_KINDS)[number];

export const MEASUREMENT_FIELDS: Record<MeasurementKind, { key: string; label: string; hint: string }[]> = {
  top: [
    { key: "pit", label: "Pit to pit", hint: "armpit seam to armpit seam, laid flat" },
    { key: "length", label: "Length", hint: "top of shoulder (by collar) to bottom hem" },
    { key: "sleeve", label: "Sleeve", hint: "shoulder seam to cuff (skip for short sleeves)" },
    { key: "shoulder", label: "Shoulder", hint: "shoulder seam to shoulder seam" },
  ],
  bottoms: [
    { key: "waist", label: "Waist (flat)", hint: "straight across the waistband, buttoned" },
    { key: "inseam", label: "Inseam", hint: "crotch seam to hem" },
    { key: "rise", label: "Rise", hint: "crotch seam to top of waistband" },
    { key: "legOpening", label: "Leg opening", hint: "straight across the hem" },
  ],
  shorts: [
    { key: "waist", label: "Waist (flat)", hint: "straight across the waistband" },
    { key: "inseam", label: "Inseam", hint: "crotch seam to hem" },
    { key: "rise", label: "Rise", hint: "crotch seam to top of waistband" },
  ],
  dress: [
    { key: "pit", label: "Pit to pit", hint: "armpit to armpit, laid flat" },
    { key: "waist", label: "Waist (flat)", hint: "narrowest point, straight across" },
    { key: "length", label: "Length", hint: "top of shoulder to hem" },
  ],
  skirt: [
    { key: "waist", label: "Waist (flat)", hint: "straight across the waistband" },
    { key: "hip", label: "Hip (flat)", hint: "widest point, straight across" },
    { key: "length", label: "Length", hint: "waistband to hem" },
  ],
  shoes: [
    { key: "insole", label: "Insole length", hint: "heel to toe inside the shoe" },
  ],
  accessory: [
    { key: "width", label: "Width", hint: "" },
    { key: "height", label: "Height", hint: "" },
  ],
};

export const MAX_HASHTAGS = 5;          // Depop allows up to 5 hashtags in a description
export const MAX_DESCRIPTION = 1000;    // Depop description character limit
export const MAX_STYLES = 3;
export const MAX_COLORS = 2;

// Depop US: no selling fee since 2024, but every sale pays payment processing,
// and a Boosted listing adds a fee when it sells. Shown as editable defaults in
// the UI because Depop changes these — the seller can correct them.
export const DEFAULT_FEES = { processingPct: 3.3, processingFixed: 0.45, boostPct: 8 };

// Typical packaging adds a few ounces (poly mailer, tissue, label).
export const PACKAGING_OZ = 3;

export function cleanHashtag(t: string): string {
  return t.replace(/^#+/, "").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
}

export function formatInches(v: string): string {
  const s = v.trim();
  if (!s) return "";
  return /^\d+(\.\d+)?$/.test(s) ? `${s}"` : s;
}

export type ListingDraft = {
  headline: string;
  body: string;
  brand: string;
  size: string;
  condition: Condition;
  material: string;
  flaws: string[];
  measurementKind: MeasurementKind;
  measurements: Record<string, string>;
  hashtags: string[];
};

// The full Depop description: headline, pitch, then the facts buyers ask about
// (size, measurements, condition + flaws, material) and hashtags last.
export function buildDescription(d: ListingDraft): string {
  const lines: string[] = [];
  if (d.headline.trim()) lines.push(d.headline.trim());
  if (d.body.trim()) lines.push(d.body.trim());
  const facts: string[] = [];
  if (d.brand.trim() && !/^(unknown|unbranded)$/i.test(d.brand.trim())) facts.push(`Brand: ${d.brand.trim()}`);
  if (d.size.trim() && !/not visible/i.test(d.size)) facts.push(`Size: ${d.size.trim()}`);
  const fields = MEASUREMENT_FIELDS[d.measurementKind] ?? [];
  const meas = fields
    .map((f) => (d.measurements[f.key]?.trim() ? `${f.label} ${formatInches(d.measurements[f.key])}` : ""))
    .filter(Boolean);
  if (meas.length) facts.push(`Measurements (laid flat): ${meas.join(" · ")}`);
  const flaws = d.flaws.map((f) => f.trim()).filter(Boolean);
  facts.push(`Condition: ${d.condition}${flaws.length ? ` — ${flaws.join("; ")} (pictured)` : ""}`);
  if (d.material.trim() && !/^unknown$/i.test(d.material.trim())) facts.push(`Material: ${d.material.trim()}`);
  lines.push(facts.join("\n"));
  const tags = d.hashtags.map(cleanHashtag).filter(Boolean).slice(0, MAX_HASHTAGS);
  if (tags.length) lines.push(tags.map((t) => `#${t}`).join(" "));
  return lines.join("\n\n");
}

export type ProfitInput = {
  price: number;
  cost: number;             // what the seller paid for the item
  boosted: boolean;
  sellerPaysShipping: boolean;
  shippingCost: number;     // label cost, only counted when the seller pays
  fees?: typeof DEFAULT_FEES;
};

export function profit(p: ProfitInput) {
  const f = p.fees ?? DEFAULT_FEES;
  const price = Math.max(0, p.price || 0);
  const processing = price > 0 ? (price * f.processingPct) / 100 + f.processingFixed : 0;
  const boost = p.boosted ? (price * f.boostPct) / 100 : 0;
  const shipping = p.sellerPaysShipping ? Math.max(0, p.shippingCost || 0) : 0;
  const payout = price - processing - boost - shipping;
  const net = payout - Math.max(0, p.cost || 0);
  const r = (n: number) => Math.round(n * 100) / 100;
  return { processing: r(processing), boost: r(boost), shipping: r(shipping), payout: r(payout), net: r(net) };
}

export function shippedWeightOz(itemOz: number): number {
  return Math.round(Math.max(1, itemOz || 0) + PACKAGING_OZ);
}
export function formatWeight(oz: number): string {
  return oz < 16 ? `${oz} oz` : `${Math.floor(oz / 16)} lb ${oz % 16} oz`;
}
