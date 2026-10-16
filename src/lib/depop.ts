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

// Her hashtag word bank — every listing's 5 hashtags come from this list.
export const HASHTAG_BANK = [
  "cottage", "cottagecore", "normcore", "gorpcore", "casual", "indie", "skater", "surfer", "grunge",
  "western", "loungewear", "minimalist", "preppy", "academia", "grandma", "workwear", "carpenter",
  "thermal", "cable", "knit", "vintage", "y2k", "90s", "striped", "retro", "baggy", "heavyweight",
  "outdoors", "hiking", "winter", "streetwear", "sportswear", "utility", "biker", "emo",
  "granola", "chunky", "americana",
] as const;
export type Hashtag = (typeof HASHTAG_BANK)[number];
const BANK = new Set<string>(HASHTAG_BANK);
// Near-misses the model (or an old listing) might use, mapped onto the bank.
const TAG_ALIASES: Record<string, string[]> = {
  skate: ["skater"], surf: ["surfer"], stripe: ["striped"], stripes: ["striped"], cableknit: ["cable", "knit"],
  hike: ["hiking"], outdoor: ["outdoors"], sporty: ["sportswear"], nineties: ["90s"], "1990s": ["90s"], darkacademia: ["academia"],
};

// Garment words that always imply a bank word, so it's never missed (a sweater is knit, a thermal is for winter).
const IMPLIED: Record<string, string[]> = {
  sweater: ["knit"], cardigan: ["knit"], knitted: ["knit"], beanie: ["knit", "winter"],
  thermal: ["winter"], fleece: ["winter"], puffer: ["winter"], parka: ["winter"], flannel: ["winter"],
  carpenter: ["workwear"],
};
export const MAX_KEYWORDS = 12;         // hashtags + the search words after the size line

/**
 * Every word-bank word that fits the item, best first and without repeats: the
 * model's ranked picks, then the item's own style tags, era, and words in its
 * title/features ("thermal", "cable", "striped"), then words those garments imply.
 * The deterministic part means an obvious word is in even if the model missed it.
 */
export function rankKeywords(chosen: string[], hints: { styles?: string[]; age?: string; text?: string } = {}): Hashtag[] {
  const out: string[] = [];
  const add = (w: string) => {
    const k = cleanHashtag(w);
    for (const t of BANK.has(k) ? [k] : TAG_ALIASES[k] ?? []) if (!out.includes(t)) out.push(t);
  };
  chosen.forEach(add);
  (hints.styles ?? []).forEach(add);
  if (hints.age === "90s") add("90s");
  if (hints.age === "00s") add("y2k");
  const words = (hints.text ?? "").toLowerCase().split(/[^a-z0-9]+/);
  for (const w of words) add(w);
  for (const w of words) (IMPLIED[w] ?? []).forEach(add);
  return out.slice(0, MAX_KEYWORDS) as Hashtag[];
}

/** Exactly 5 hashtags from her word bank: the top-ranked keywords, then safe defaults. */
export function pickHashtags(chosen: string[], hints: { styles?: string[]; age?: string; text?: string } = {}): Hashtag[] {
  const out: string[] = rankKeywords(chosen, hints).slice(0, MAX_HASHTAGS);
  for (const d of ["casual", "vintage", "indie", "streetwear", "winter"]) if (out.length < MAX_HASHTAGS && !out.includes(d)) out.push(d);
  return out as Hashtag[];
}

/**
 * The bank words that didn't make the 5 hashtags, to work into the first line.
 * Skips anything already a hashtag or already in the first line, so no word
 * shows up more than twice in the description.
 */
export function overflowKeywords(keywords: string[], hashtags: string[], headline = ""): string[] {
  const used = new Set([...hashtags.map(cleanHashtag), ...headline.toLowerCase().split(/[^a-z0-9]+/)]);
  const out: string[] = [];
  for (const k of keywords.map(cleanHashtag)) if (BANK.has(k) && !used.has(k) && !out.includes(k)) out.push(k);
  return out;
}
export const MAX_DESCRIPTION = 1000;    // Depop description character limit
export const MAX_STYLES = 3;
export const MAX_COLORS = 2;

// Depop US: no selling fee since 2024, but every sale pays payment processing —
// charged on everything the buyer pays (item + shipping + sales tax) — and a
// Boosted listing adds a fee on the item price when it sells. Checked against
// real payouts (Oct 2026): unboosted sales match to within cents, boosted ones
// cost 12%. Editable in the UI because Depop changes these.
export const DEFAULT_FEES = { processingPct: 3.3, processingFixed: 0.45, boostPct: 12, buyerShipping: 3.99, salesTaxPct: 7 };
export type Fees = typeof DEFAULT_FEES;

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
  size: string;
  flaws: string[];
  measurementKind: MeasurementKind;
  measurements: Record<string, string>;
  hashtags: string[];
};

// The Depop description, laid out the way @soldbychica writes hers:
//   Eddie Bauer gray skater surfer indie waffle knit thermal long sleeve shirt
//   size L
//   small stain on front (pictured)
//
//   #indie #skater #surfer #thermal #winter
// The keyword-rich first line does the search work; no pitch, and no brand,
// condition or material lines (those go in Depop's own fields).
export function buildDescription(d: ListingDraft): string {
  const top: string[] = [];
  if (d.headline.trim()) top.push(d.headline.trim());
  const size = d.size.trim();
  top.push(size && !/not visible|unknown/i.test(size) ? `size ${size.replace(/^size\s+/i, "")}` : "size not tagged — check measurements for accuracy");
  for (const f of d.flaws.map((x) => x.trim()).filter(Boolean)) top.push(/pictured/i.test(f) ? f : `${f} (pictured)`);
  const fields = MEASUREMENT_FIELDS[d.measurementKind] ?? [];
  const meas = fields
    .map((f) => (d.measurements[f.key]?.trim() ? `${f.label.toLowerCase()} ${formatInches(d.measurements[f.key])}` : ""))
    .filter(Boolean);
  if (meas.length) top.push(`measurements laid flat: ${meas.join(", ")}`);
  const tags = d.hashtags.map(cleanHashtag).filter(Boolean).slice(0, MAX_HASHTAGS);
  return [top.join("\n"), tags.map((t) => `#${t}`).join(" ")].filter(Boolean).join("\n\n");
}

export type ProfitInput = {
  price: number;
  cost: number;             // what the seller paid for the item
  boosted: boolean;
  sellerPaysShipping: boolean;
  shippingCost: number;     // label cost, only counted when the seller pays
  fees?: Fees;
};

export function profit(p: ProfitInput) {
  const f = p.fees ?? DEFAULT_FEES;
  const price = Math.max(0, p.price || 0);
  // What the buyer pays, which processing is charged on: shipping is theirs unless the seller covers it.
  const buyerPays = price * (1 + f.salesTaxPct / 100) + (p.sellerPaysShipping ? 0 : f.buyerShipping);
  const processing = price > 0 ? (buyerPays * f.processingPct) / 100 + f.processingFixed : 0;
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

// Style words buyers search on Depop (and the words her hashtags shorten them to).
const STYLE_WORDS: Record<string, string> = {
  indie: "indie", skater: "skater", skate: "skater", surfer: "surfer", surf: "surfer", grunge: "grunge",
  y2k: "y2k", vintage: "vintage", preppy: "preppy", oldmoney: "old money", cottagecore: "cottagecore",
  cottage: "cottagecore", granola: "granola", gorpcore: "gorpcore", workwear: "workwear", streetwear: "streetwear",
  casual: "casual", boho: "boho", western: "western", coastal: "coastal", retro: "retro", minimalist: "minimalist",
  sportswear: "sporty", sporty: "sporty", utility: "utility", punk: "punk", emo: "emo", goth: "goth",
  coquette: "coquette", techwear: "techwear", loungewear: "loungewear", outdoors: "outdoors", beach: "beach",
};
const COLOR_WORDS = /^(black|gr[ae]y|white|cream|tan|brown|khaki|green|olive|blue|navy|purple|pink|red|maroon|burgundy|orange|yellow|silver|gold|teal|beige|mocha|charcoal|heather|light|dark)$/i;
const MIN_STYLE_WORDS = 3;

const GARMENT_WORDS = /^(carpenter|bootcut|straight|wide|baggy|boxy|relaxed|cropped|oversized|v-neck|mock|turtleneck|puffer|bomber|board|basketball|athletic|striped|plaid|knit|graphic|waffle|thermal|henley|long|short|quarter|zip|crewneck|crew|sweatshirt|hoodie|sweater|cardigan|tee|t-shirt|shirt|polo|jersey|tank|top|blouse|jeans|denim|pants|trousers|joggers|cargo|cargos|shorts|skirt|dress|jacket|coat|fleece|vest|windbreaker|track|button|flannel|corduroy|cable)$/i;

// Make sure the first line reads like hers and carries enough search words: a
// colour, then style words, then the item. Missing pieces come from the item's
// own colour, style tags and hashtags. "Old Navy waffle knit thermal" →
// "Old Navy gray indie skater waffle knit thermal".
export function enrichHeadline(headline: string, candidates: string[], color = ""): string {
  const words = headline.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return headline;
  const key = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, "");
  const has = new Set(words.map((w) => STYLE_WORDS[key(w)]).filter(Boolean));
  const add: string[] = [];
  for (const c of candidates) {
    if (has.size + add.length >= MIN_STYLE_WORDS) break;
    const s = STYLE_WORDS[key(c)];
    if (s && !has.has(s) && !add.includes(s)) add.push(s);
  }
  // Where her lines put these: after the colour; with no colour, before the garment words.
  let at = -1;
  for (let i = 0; i < Math.min(words.length, 7); i++) if (COLOR_WORDS.test(words[i].replace(/[^a-z]/gi, ""))) at = i + 1;
  const needColor = at < 0 && color.trim() && !/^multi$/i.test(color.trim());
  if (at < 0) {
    const g = words.findIndex((w, i) => i > 0 && GARMENT_WORDS.test(w.replace(/[^a-z-]/gi, "")));
    at = g > 0 ? g : words.length;
  }
  const insert = [...(needColor ? [color.trim().toLowerCase()] : []), ...add];
  if (!insert.length) return words.join(" ");
  return [...words.slice(0, at), ...insert, ...words.slice(at)].join(" ");
}

export const MAX_HEADLINE_WORDS = 22;

/**
 * Put the extra bank words (see overflowKeywords) into the first line, right after
 * its run of style words: "Croft & Barrow cream cottagecore preppy cable knit
 * sweater" + [chunky, winter] → "… cream cottagecore preppy chunky winter cable knit
 * sweater". With no style words they go after the brand and colour. Done here, not
 * by the model, so it works whatever first line the model wrote. Highest-ranked
 * extras are kept if the line would pass ~22 words.
 */
export function insertKeywords(headline: string, extras: string[], brand = ""): string {
  const words = headline.trim().split(/\s+/).filter(Boolean);
  const key = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, "");
  const present = new Set(words.map(key));
  const add = extras.map(key).filter((k, i, a) => k && !present.has(k) && a.indexOf(k) === i)
    .slice(0, Math.max(0, MAX_HEADLINE_WORDS - words.length));
  if (!words.length || !add.length) return words.join(" ");
  const isStyle = (w: string) => {
    const k = key(w);
    return !!STYLE_WORDS[k] || (BANK.has(k) && !GARMENT_WORDS.test(k));
  };
  // The style run sits before the item words; insert after its last word.
  const g0 = words.findIndex((w, i) => i > 0 && GARMENT_WORDS.test(w.replace(/[^a-z-]/gi, "")));
  let at = -1;
  for (let i = (g0 > 0 ? g0 : words.length) - 1; i >= 0 && at < 0; i--) if (isStyle(words[i])) at = i + 1;
  if (at < 0) {
    // After the brand (if the line starts with it), then after a colour word right behind it.
    const b = brand.trim().split(/\s+/).filter(Boolean);
    const startsWithBrand = b.length > 0 && !/^(unbranded|unknown)$/i.test(brand.trim())
      && b.every((w, i) => key(words[i] ?? "") === key(w));
    at = startsWithBrand ? b.length : 0;
    for (let i = at; i < Math.min(words.length, at + 3); i++) if (COLOR_WORDS.test(words[i].replace(/[^a-z]/gi, ""))) at = i + 1;
    if (!startsWithBrand && at === 0) {
      const g = words.findIndex((w, i) => i > 0 && GARMENT_WORDS.test(w.replace(/[^a-z-]/gi, "")));
      at = g > 0 ? g : words.length;
    }
  }
  return [...words.slice(0, at), ...add, ...words.slice(at)].join(" ");
}
