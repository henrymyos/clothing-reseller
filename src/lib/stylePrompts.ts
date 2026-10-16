// Ready-to-paste prompts for the free "Styled photos" path: the seller copies a
// prompt, opens the Gemini (or ChatGPT) app, attaches her own item photo and
// pastes. SnapList itself makes no image calls, costs nothing and stores nothing.
// Pure functions (no React, no server deps) so they're unit-tested in tests/.
//
// Templates follow Nova's spec (~/Documents/Ideas/specs/snaplist-ai-images.md §4):
// one shared garment-fidelity block, an on-model shot cropped neck-down with no
// face, and an overhead flat-lay with 2–4 plain, unbranded pieces that never
// cover or change the item. Kids' items never get an on-model prompt.

export const PROMPT_VERSION = 1;

/** The optional chip that tweaks the flat-lay styling pieces. */
export const STYLE_CHIPS = ["Streetwear", "Vintage", "Casual", "Dressy"] as const;
export type StyleChip = (typeof STYLE_CHIPS)[number];
export const DEFAULT_STYLE_CHIP: StyleChip = "Casual";

export const GEMINI_URL = "https://gemini.google.com/app";
export const CHATGPT_URL = "https://chatgpt.com";

/** Whatever we know about the item: the (edited) analysis, or just her notes if it failed. */
export type PromptItem = {
  itemType?: string;
  brand?: string;
  colors?: readonly string[];
  material?: string;
  size?: string;
  distinctiveFeatures?: readonly string[];
  styles?: readonly string[];
  department?: string;
  category?: string;
  subcategory?: string;
  measurementKind?: string;
  /** Free text the seller typed, used when there's no analysis. */
  notes?: string;
};

export type ItemKind = "top" | "outerwear" | "bottoms" | "shorts" | "skirt" | "dress" | "shoes" | "accessory";

export type StylePrompts = {
  /** null for kids' items: no on-model shot. */
  onModel: string | null;
  flatLay: string;
  kids: boolean;
  kind: ItemKind;
};

const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

function knownBrand(item: PromptItem): string {
  const b = clean(item.brand);
  return !b || /^(unbranded|unknown|none|n\/a|no brand)$/i.test(b) ? "" : b;
}
function knownMaterial(item: PromptItem): string {
  const m = clean(item.material);
  return !m || /^unknown$/i.test(m) ? "" : m.replace(/^Likely\b/, "likely");
}
function knownSize(item: PromptItem): string {
  const s = clean(item.size);
  return !s || /not visible|unknown|^n\/a$/i.test(s) ? "" : s.replace(/^size\s+/i, "");
}
function list(items: readonly string[] | undefined): string[] {
  return (items ?? []).map(clean).filter(Boolean);
}
function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

// "baby" is left out on purpose: a "baby tee" is an adult style.
const KIDS_WORDS = /\b(?:kids?|kid's|child|children'?s?|toddlers?|infants?|youth|newborn)\b|\b(?:boys|girls)'|\b\d+\s*(?:t|months?|mo)\b/i;

/** Kids' items get no on-model shot. Uses the Depop department, or her notes if there's no analysis. */
export function isKids(item: PromptItem): boolean {
  const dept = clean(item.department);
  if (dept) return /^kids$/i.test(dept);
  return KIDS_WORDS.test(`${clean(item.itemType)} ${clean(item.notes)}`);
}

const OUTERWEAR = /\b(jacket|coat|blazer|parka|puffer|windbreaker|anorak|gilet|vest|bomber|trench|overcoat|peacoat|shacket|fleece)\b/i;

/** What kind of item it is, which decides the framing and the styling pieces. */
export function itemKind(item: PromptItem): ItemKind {
  const text = [item.itemType, item.subcategory, item.category, item.notes].map(clean).join(" ");
  const mk = clean(item.measurementKind);
  if (mk === "top" || (!mk && OUTERWEAR.test(text))) return OUTERWEAR.test(text) ? "outerwear" : "top";
  if (mk === "bottoms" || mk === "shorts" || mk === "skirt" || mk === "dress" || mk === "shoes" || mk === "accessory") return mk;
  if (/\b(dress|gown|romper|jumpsuit|playsuit)\b/i.test(text)) return "dress";
  if (/\bskirts?\b/i.test(text)) return "skirt";
  if (/\bshorts\b/i.test(text)) return "shorts";
  if (/\b(jeans|pants|trousers|leggings|joggers|sweatpants|cargos?|chinos|slacks|overalls)\b/i.test(text)) return "bottoms";
  if (/\b(shoes?|sneakers?|trainers|boots?|heels|loafers|sandals|footwear|clogs|flats)\b/i.test(text)) return "shoes";
  if (/\b(bag|tote|purse|backpack|hat|cap|beanie|belt|scarf|wallet|jewell?ery|necklace|accessor(y|ies))\b/i.test(text)) return "accessory";
  return "top";
}

/** How we name the item: "Carhartt brown canvas jacket", or "clothing item" if we know nothing. */
function itemName(item: PromptItem): string {
  const type = clean(item.itemType).toLowerCase();
  return type || "clothing item";
}

/**
 * The block both prompts share. It always tells the AI to use the attached
 * photo as the reference and to keep the exact garment, unchanged.
 */
export function fidelityBlock(item: PromptItem): string {
  const brand = knownBrand(item);
  const colors = list(item.colors).map((c) => c.toLowerCase());
  const material = knownMaterial(item);
  const size = knownSize(item);
  const features = list(item.distinctiveFeatures);
  const styles = list(item.styles);
  const notes = clean(item.notes).slice(0, 300);

  const facts = [colors.length ? joinAnd(colors) : "", material].filter(Boolean).join(", ");
  const lines = [
    `Use the attached photo as the reference. Keep the exact garment from it: the same colour, print, logo, text and shape.`,
    `GARMENT, which must not change: the ${itemName(item)}${brand ? ` by ${brand}` : ""} in the attached photo${facts ? ` (${facts})` : ""}. ` +
      `Reproduce it exactly: same colour and shade, fabric texture, cut, length, sleeve length, fit, neckline, buttons and seams, ` +
      `and every print, graphic, text and logo at the same size and position. Keep any visible wear. ` +
      `Do not add, remove, redraw, translate, "fix" or restyle any graphic, text or logo.`,
  ];
  if (features.length) lines.push(`Key details: ${features.join("; ")}.`);
  if (size) lines.push(`Size ${size}: show it with a true-to-size fit, not tighter or looser than it really is.`);
  if (styles.length) lines.push(`Its style: ${joinAnd(styles)}.`);
  if (notes) lines.push(`What the seller says about it: ${notes}`);
  return lines.join("\n");
}

const OUTPUT_LINE = "OUTPUT: one photo, 2:3 portrait (vertical, e.g. 1000×1500) for Pinterest, with the garment centred so a square crop still shows all of it.";

function person(item: PromptItem): string {
  const dept = clean(item.department);
  if (/^women$/i.test(dept)) return "an adult woman";
  if (/^men$/i.test(dept)) return "an adult man";
  return "an adult person";
}

function framing(kind: ItemKind): string {
  return kind === "top" || kind === "outerwear"
    ? "crop from the base of the neck down to mid-thigh"
    : "crop from the base of the neck down to the feet";
}

function otherClothes(kind: ItemKind): string {
  switch (kind) {
    case "top": return "plain mid-wash straight jeans";
    case "outerwear": return "a plain white tee and plain mid-wash straight jeans";
    case "bottoms":
    case "shorts":
    case "skirt": return "a plain white fitted tee, tucked in, and plain white sneakers";
    case "dress": return "simple plain flat shoes";
    case "shoes": return "a plain white tee and plain mid-wash jeans cuffed above the ankle";
    case "accessory": return "a plain white tee and plain mid-wash straight jeans";
  }
}

/** On-model shot: neck down, no face. Returns null for kids' items. */
export function onModelPrompt(item: PromptItem): string | null {
  if (isKids(item)) return null;
  const kind = itemKind(item);
  return [
    `Edit task: photograph the exact garment from the attached photo being worn by a person.`,
    fidelityBlock(item),
    `FRAMING: ${framing(kind)}. The head and face are completely out of frame: no face, chin or mouth. Centre the garment with space around it.`,
    `PERSON: ${person(item)}, natural average build, relaxed straight-on pose, arms at the sides so nothing covers the garment. Other clothing is plain and unbranded: ${otherClothes(kind)}.`,
    `SETTING: realistic photo, soft natural daylight, plain off-white or light warm-grey wall, true-to-life colour, no filters, props, text or watermark.`,
    OUTPUT_LINE,
  ].join("\n");
}

type Pieces = { top: string; bottoms: string; shoes: string; accessory: string; bag: string; jewellery: string };

// The plain, unbranded styling pieces for each look.
const LOOKS: Record<StyleChip, Pieces> = {
  Streetwear: {
    top: "an oversized plain tee",
    bottoms: "baggy cargo pants or loose straight jeans",
    shoes: "chunky plain sneakers",
    accessory: "a plain beanie or cap",
    bag: "a small plain crossbody bag",
    jewellery: "a simple chain necklace",
  },
  Vintage: {
    top: "a plain ribbed knit top",
    bottoms: "high-waisted straight-leg jeans in a faded wash",
    shoes: "worn brown leather loafers",
    accessory: "a simple leather belt or round sunglasses",
    bag: "a small worn leather shoulder bag",
    jewellery: "simple gold-tone jewellery",
  },
  Casual: {
    top: "a plain white tee",
    bottoms: "plain mid-wash straight jeans",
    shoes: "clean plain white sneakers",
    accessory: "a simple canvas tote",
    bag: "a simple canvas tote",
    jewellery: "a simple watch",
  },
  Dressy: {
    top: "a plain silky button-up blouse",
    bottoms: "tailored plain trousers",
    shoes: "sleek leather loafers or heels",
    accessory: "a small structured leather bag",
    bag: "a small structured leather bag",
    jewellery: "delicate jewellery",
  },
};

/** The 2–4 pieces that complete the outfit, picked by item kind and look. */
export function stylingPieces(kind: ItemKind, style: StyleChip): string[] {
  const p = LOOKS[style];
  switch (kind) {
    case "top": return [p.bottoms, p.shoes, p.accessory];
    case "outerwear": return [p.top, p.bottoms, p.shoes];
    case "bottoms":
    case "shorts":
    case "skirt": return [p.top, p.shoes, p.accessory];
    case "dress": return [p.shoes, p.bag, p.jewellery];
    case "shoes": return [p.top, p.bottoms, p.accessory];
    case "accessory": return [p.top, p.bottoms, p.shoes];
  }
}

export function isStyleChip(s: string): s is StyleChip {
  return (STYLE_CHIPS as readonly string[]).includes(s);
}

/** Flat-lay outfit: overhead, on a neutral surface, the item is the hero and never covered. */
export function flatLayPrompt(item: PromptItem, style: StyleChip = DEFAULT_STYLE_CHIP): string {
  const look = isStyleChip(style) ? style : DEFAULT_STYLE_CHIP;
  const kind = itemKind(item);
  const colors = list(item.colors).map((c) => c.toLowerCase());
  const kids = isKids(item);
  return [
    `Edit task: an overhead flat-lay photo of the exact garment from the attached photo, styled as an outfit.`,
    fidelityBlock(item),
    `The garment is the hero: laid flat and smoothed, fully visible, centred, filling about half the frame, never folded over its print and never covered.`,
    `STYLING: add 2–4 complementary pieces for a ${look.toLowerCase()} look, for example ${joinAnd(stylingPieces(kind, look))}${kids ? ", all in children's sizes" : ""}. ` +
      `They are plain and unbranded (no logos, text or recognisable brands), in colours that complement ${colors.length ? `the ${joinAnd(colors)}` : "the garment"}, ` +
      `arranged around the garment without overlapping, covering or changing it.`,
    `SURFACE: a neutral surface (light wood floor, off-white linen or pale concrete), shot straight down, soft even daylight, gentle shadows, true-to-life colour. No people, no face, no hands, no text or watermark.`,
    OUTPUT_LINE,
  ].join("\n");
}

export function buildStylePrompts(item: PromptItem, style: StyleChip = DEFAULT_STYLE_CHIP): StylePrompts {
  return { onModel: onModelPrompt(item), flatLay: flatLayPrompt(item, style), kids: isKids(item), kind: itemKind(item) };
}
