import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import type { Analysis } from "@/lib/schema";

// The listing must still be written when the Depop price search is out of credits.
// No real AI or Exa calls: both are mocked.
const exaSearch = vi.fn();
const generateObject = vi.fn();
vi.mock("exa-js", () => ({ default: class { search = exaSearch; } }));
vi.mock("ai", async (orig) => ({ ...(await orig<typeof import("ai")>()), generateObject }));

const analysis: Analysis = {
  headline: "Gildan black skater grunge crewneck sweatshirt with band graphic",
  itemType: "Sweatshirt", brand: "Gildan", brandTier: "blank", distinctiveFeatures: ["band graphic"],
  department: "Men", category: "Tops", subcategory: "Sweatshirts", size: "L", sizeSource: "tag", sizeTagText: "L",
  condition: "Used - Good", visibleFlaws: [], colors: ["Black"], styles: [], age: "Modern", source: "Preloved",
  material: "50% cotton, 50% polyester", keywords: [], measurementKind: "top", estimatedWeightOz: 20,
  searchQuery: "gildan band crewneck", searchQueryBroad: "band crewneck sweatshirt",
  priceLow: 18, priceHigh: 26, suggestedPrice: 22, priceReasoning: "From the photos.", confidence: "medium",
} as Analysis;

function request() {
  return new NextRequest("http://localhost/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.1" },
    body: JSON.stringify({ images: ["data:image/jpeg;base64,AAAA"] }),
  });
}

describe("analyze with the Depop search out of credits", () => {
  beforeEach(() => {
    vi.stubEnv("EXA_API_KEY", "test-key-not-real");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
    exaSearch.mockReset().mockRejectedValue(new Error("You have exceeded your credits limit"));
    generateObject.mockReset().mockImplementation(async () => ({ object: structuredClone(analysis) }));
  });
  afterEach(() => vi.unstubAllEnvs());

  it("still writes the listing, with a small comps note and no warning banner", async () => {
    const { POST } = await import("@/app/api/analyze/route");
    const res = await POST(request());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.headline).toMatch(/Gildan/);
    expect(body.suggestedPrice).toBeGreaterThan(0);
    expect(body.comps).toBeNull();
    expect(body.priceBasis).toBe("photos");
    expect(body.compsNote).toMatch(/^Depop price comps unavailable right now \(it's out of credits\)/);
    expect(body.notices).toEqual([]);
    expect(body.error).toBeUndefined();
  });

  it("uses her own sales for the price note when she has them", async () => {
    const { POST } = await import("@/app/api/analyze/route");
    const req = new NextRequest("http://localhost/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.2" },
      body: JSON.stringify({
        images: ["data:image/jpeg;base64,AAAA"],
        sales: [{ title: "Gildan black band graphic crewneck sweatshirt", price: 24, brand: "Gildan" }, { title: "Gildan crewneck sweatshirt band tour", price: 20, brand: "Gildan" }],
      }),
    });
    const body = await (await POST(req)).json();
    expect(body.compsNote).toMatch(/unavailable right now/);
    expect(body.mySales).not.toBeNull();
    expect(body.compsNote).toMatch(/so this comes from your own sales\.$/);
    expect(body.notices).toEqual([]);
  });
});
