import { describe, it, expect } from "vitest";
import {
  DEFAULT_STYLE_CHIP, STYLE_CHIPS, buildStylePrompts, fidelityBlock, flatLayPrompt, isKids, itemKind, onModelPrompt,
  stylingPieces, type PromptItem,
} from "@/lib/stylePrompts";

const tee: PromptItem = {
  itemType: "Graphic T-shirt",
  brand: "Harley-Davidson",
  colors: ["Black", "Orange"],
  material: "100% cotton",
  size: "L",
  distinctiveFeatures: ["eagle graphic on back", "Sturgis 1998 text"],
  styles: ["Vintage", "Streetwear"],
  department: "Men",
  category: "Tops",
  subcategory: "T-shirts",
  measurementKind: "top",
};

// The non-negotiables for every prompt we hand her.
function expectSafe(p: string) {
  expect(p).toMatch(/keep the exact garment/i);
  expect(p).toMatch(/no face/i);
  expect(p).toMatch(/attached photo as the reference/i);
  expect(p).toMatch(/2:3 portrait/);
  expect(p).toMatch(/Pinterest/);
  expect(p).toMatch(/colour, print, logo, text and shape/);
}

describe("both prompts", () => {
  it("always say 'keep the exact garment' and 'no face', with the reference photo and 2:3 output", () => {
    const { onModel, flatLay } = buildStylePrompts(tee);
    expectSafe(onModel!);
    expectSafe(flatLay);
  });

  it("are filled from the analysis: type, brand, colours, material, size, details, style", () => {
    const { onModel, flatLay } = buildStylePrompts(tee);
    for (const p of [onModel!, flatLay]) {
      expect(p).toContain("graphic t-shirt by Harley-Davidson");
      expect(p).toContain("(black and orange, 100% cotton)");
      expect(p).toContain("Key details: eagle graphic on back; Sturgis 1998 text.");
      expect(p).toContain("Size L");
      expect(p).toContain("Its style: Vintage and Streetwear.");
    }
  });

  it("share the same fidelity block", () => {
    const block = fidelityBlock(tee);
    const { onModel, flatLay } = buildStylePrompts(tee);
    expect(onModel).toContain(block);
    expect(flatLay).toContain(block);
  });
});

describe("on-model prompt", () => {
  it("crops neck-down with the face completely out of frame", () => {
    const p = onModelPrompt(tee)!;
    expect(p).toContain("crop from the base of the neck down to mid-thigh");
    expect(p).toContain("face are completely out of frame: no face, chin or mouth");
    expect(p).toContain("an adult man");
  });

  it("frames bottoms and dresses down to the feet and picks the person from the department", () => {
    const p = onModelPrompt({ itemType: "Midi dress", department: "Women", measurementKind: "dress", colors: ["Red"] })!;
    expect(p).toContain("down to the feet");
    expect(p).toContain("an adult woman");
    expect(onModelPrompt({ itemType: "Jeans" })).toContain("an adult person");
  });
});

describe("kids' items", () => {
  it("get no on-model prompt, only a flat-lay", () => {
    const kid = { ...tee, department: "Kids" };
    expect(onModelPrompt(kid)).toBeNull();
    const out = buildStylePrompts(kid);
    expect(out.kids).toBe(true);
    expect(out.onModel).toBeNull();
    expectSafe(out.flatLay);
    expect(out.flatLay).toContain("children's sizes");
  });

  it("are spotted from her notes when there's no analysis", () => {
    expect(isKids({ notes: "toddler 3T dinosaur hoodie" })).toBe(true);
    expect(isKids({ notes: "girls' party dress size 8" })).toBe(true);
    expect(isKids({ notes: "y2k baby tee, pink, size S" })).toBe(false); // an adult style
    expect(isKids({ notes: "kids hoodie", department: "Women" })).toBe(false); // the department wins
  });
});

describe("flat-lay prompt and style chips", () => {
  it("defaults to Casual", () => {
    expect(DEFAULT_STYLE_CHIP).toBe("Casual");
    expect(flatLayPrompt(tee)).toContain("for a casual look");
    expect(flatLayPrompt(tee)).toBe(flatLayPrompt(tee, "Casual"));
  });

  it("asks for 2–4 plain, unbranded pieces that never cover or change the item, on a neutral surface", () => {
    const p = flatLayPrompt(tee);
    expect(p).toContain("add 2–4 complementary pieces");
    expect(p).toContain("plain and unbranded (no logos, text or recognisable brands)");
    expect(p).toContain("without overlapping, covering or changing it");
    expect(p).toContain("never covered");
    expect(p).toMatch(/SURFACE: a neutral surface/);
  });

  it("each chip changes the pieces, and only the pieces", () => {
    const prompts = STYLE_CHIPS.map((s) => flatLayPrompt(tee, s));
    expect(new Set(prompts).size).toBe(STYLE_CHIPS.length);
    expect(prompts[0]).toContain("streetwear look");
    expect(prompts[0]).toContain("chunky plain sneakers");
    expect(prompts[1]).toContain("vintage look");
    expect(prompts[1]).toContain("leather loafers");
    expect(prompts[3]).toContain("dressy look");
    expect(prompts[3]).toContain("tailored plain trousers");
    for (const p of prompts) expectSafe(p);
    // The chip never touches the on-model prompt.
    expect(buildStylePrompts(tee, "Dressy").onModel).toBe(buildStylePrompts(tee, "Streetwear").onModel);
  });

  it("picks 2–4 pieces that suit the item kind (no second top for a top)", () => {
    for (const style of STYLE_CHIPS) {
      for (const kind of ["top", "outerwear", "bottoms", "shorts", "skirt", "dress", "shoes", "accessory"] as const) {
        const n = stylingPieces(kind, style).length;
        expect(n).toBeGreaterThanOrEqual(2);
        expect(n).toBeLessThanOrEqual(4);
      }
    }
    expect(stylingPieces("top", "Casual")).not.toContain("a plain white tee");
    expect(stylingPieces("bottoms", "Casual")).not.toContain("plain mid-wash straight jeans");
  });

  it("falls back to Casual for an unknown chip", () => {
    expect(flatLayPrompt(tee, "Goth" as never)).toBe(flatLayPrompt(tee, "Casual"));
  });
});

describe("item kind", () => {
  it("reads the measurement kind, telling outerwear from tops", () => {
    expect(itemKind(tee)).toBe("top");
    expect(itemKind({ itemType: "Denim jacket", measurementKind: "top" })).toBe("outerwear");
    expect(itemKind({ itemType: "Cargo pants", measurementKind: "bottoms" })).toBe("bottoms");
  });
  it("guesses from words when there's no analysis", () => {
    expect(itemKind({ notes: "levis 501 jeans 32x30" })).toBe("bottoms");
    expect(itemKind({ notes: "floral slip dress" })).toBe("dress");
    expect(itemKind({ notes: "carhartt detroit jacket" })).toBe("outerwear");
    expect(itemKind({ notes: "nike dunks sneakers" })).toBe("shoes");
    expect(itemKind({})).toBe("top");
  });
});

describe("missing fields", () => {
  it("still makes safe prompts from nothing at all", () => {
    const { onModel, flatLay } = buildStylePrompts({});
    expectSafe(onModel!);
    expectSafe(flatLay);
    expect(flatLay).toContain("the clothing item in the attached photo.");
    expect(flatLay).toContain("complement the garment");
    for (const p of [onModel!, flatLay]) {
      expect(p).not.toMatch(/undefined|null|\(\)|Key details|Size |Its style/);
    }
  });

  it("leaves out 'Unbranded', 'Unknown' material and a size that wasn't visible", () => {
    const p = flatLayPrompt({ itemType: "Hoodie", brand: "Unbranded", material: "Unknown", size: "Not visible", colors: ["Grey"] });
    expect(p).toContain("the hoodie in the attached photo (grey).");
    expect(p).not.toMatch(/Unbranded|Unknown|Not visible|by /);
    expect(p).not.toMatch(/Size /);
  });

  it("keeps a guessed material, lowercased", () => {
    expect(fidelityBlock({ itemType: "Sweater", material: "Likely wool" })).toContain("(likely wool)");
  });

  it("uses her notes when the analysis failed", () => {
    const p = buildStylePrompts({ notes: "  vintage levis 501 jeans,  light wash, 32x30 " });
    expect(p.kind).toBe("bottoms");
    expect(p.onModel).toContain("What the seller says about it: vintage levis 501 jeans, light wash, 32x30");
    expect(p.onModel).toContain("down to the feet");
    expectSafe(p.flatLay);
  });

  it("trims very long notes", () => {
    const p = fidelityBlock({ notes: "x".repeat(2000) });
    expect(p.length).toBeLessThan(1200);
  });
});
