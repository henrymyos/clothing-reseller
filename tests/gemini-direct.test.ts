// Direct Gemini end to end through the real AI SDK + @ai-sdk/google code, with the
// network replaced by a fake fetch. No real AI call is made: any request that isn't to
// Google's Gemini endpoint fails the test, and gateway models are stubbed in `run`.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateObject } from "ai";
import { withModelFallback, resetModelSkips, PRIMARY_MODEL, DIRECT_MODEL_IDS } from "@/lib/model";
import { analysisSchema, pricingSchema, trimAnalysisArrays, type Analysis } from "@/lib/schema";
import { modelNotice } from "@/lib/notices";

vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});

const [DIRECT_LITE, DIRECT_FLASH] = DIRECT_MODEL_IDS;
const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

const ANALYSIS: Analysis = {
  headline: "Eddie Bauer gray skater indie waffle knit thermal long sleeve shirt",
  itemType: "Long sleeve shirt", brand: "Eddie Bauer", brandTier: "mainstream",
  distinctiveFeatures: ["waffle knit"], department: "Men", category: "Tops", subcategory: "T-shirts",
  size: "L", sizeSource: "tag", sizeTagText: "L", condition: "Used - Excellent", visibleFlaws: [],
  colors: ["Grey"], styles: ["Skater", "Indie"], age: "Modern", source: "Preloved", material: "100% cotton",
  hashtags: ["thermal", "indie", "skater", "grunge", "casual"], measurementKind: "top", estimatedWeightOz: 8,
  searchQuery: "eddie bauer waffle thermal", searchQueryBroad: "waffle thermal long sleeve",
  priceLow: 18, priceHigh: 26, suggestedPrice: 22, priceReasoning: "Clean mainstream thermal.", confidence: "high",
};

type Call = { url: string; body: Record<string, unknown>; apiKey: string | null };
let calls: Call[];

function geminiReply(obj: unknown) {
  return new Response(JSON.stringify({
    candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(obj) }] }, finishReason: "STOP", index: 0 }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10, totalTokenCount: 20 },
    modelVersion: "gemini-3.5-flash-lite",
  }), { status: 200, headers: { "content-type": "application/json" } });
}
function geminiError(status: number, message: string, quotaId?: string) {
  return new Response(JSON.stringify({
    error: { code: status, message, status: status === 429 ? "RESOURCE_EXHAUSTED" : "INVALID_ARGUMENT", details: quotaId ? [{ violations: [{ quotaId }] }] : [] },
  }), { status, headers: { "content-type": "application/json" } });
}

function fakeNetwork(respond: (model: string) => Response) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const m = url.match(/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/([^:]+):generateContent/);
    if (!m) throw new Error(`Unexpected network call in a test: ${url}`);
    const headers = new Headers(init?.headers);
    calls.push({ url, body: JSON.parse(String(init?.body)), apiKey: headers.get("x-goog-api-key") });
    return respond(m[1]);
  }));
}

// The same vision call /api/analyze makes.
const analyze = (onModel?: (id: string) => void) =>
  withModelFallback(async (model, abortSignal, id) => {
    if (!id.startsWith("google-direct/")) return { object: { ...ANALYSIS, headline: `gateway ${id}` } };
    return generateObject({
      model, abortSignal, maxRetries: 0, schema: analysisSchema, experimental_repairText: trimAnalysisArrays,
      system: "You list secondhand clothing on Depop.", temperature: 0.2,
      messages: [{ role: "user", content: [{ type: "text", text: "Here is 1 photo of one item." }, { type: "image", image: PHOTO }] }],
    });
  }, { onModel });

beforeEach(() => {
  calls = [];
  resetModelSkips();
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-key-not-real");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("direct Gemini structured output", () => {
  it("sends the analysis schema as Gemini's responseSchema, with the photo inline, and parses the answer", async () => {
    fakeNetwork(() => geminiReply(ANALYSIS));
    const used: string[] = [];
    const { object } = await analyze((id) => used.push(id));
    expect(object).toEqual(ANALYSIS);
    expect(used).toEqual([DIRECT_LITE]);
    expect(modelNotice(used)).toBeNull(); // the usual path: no "backup" notice

    expect(calls).toHaveLength(1);
    const { url, body, apiKey } = calls[0];
    expect(url).toContain("/models/gemini-3.5-flash-lite:generateContent");
    expect(apiKey).toBe("test-key-not-real");
    const config = body.generationConfig as { responseMimeType: string; responseSchema: { type: string; required: string[]; properties: Record<string, { type?: string; enum?: string[]; items?: { enum?: string[] } }> } };
    expect(config.responseMimeType).toBe("application/json");
    const schema = config.responseSchema;
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(expect.arrayContaining(Object.keys(ANALYSIS)));
    expect(schema.properties.condition.enum).toContain("Used - Excellent");
    expect(schema.properties.hashtags.items?.enum).toContain("thermal");
    expect(schema.properties.estimatedWeightOz.type).toBe("number");
    // Nothing Gemini's OpenAPI-style schema rejects.
    expect(JSON.stringify(schema)).not.toMatch(/"\$schema"|"additionalProperties"|"\$ref"/);
    const parts = (body.contents as { parts: Record<string, unknown>[] }[])[0].parts;
    expect(parts).toContainEqual({ inlineData: { mimeType: "image/jpeg", data: PHOTO.split(",")[1] } });
  });

  it("works for the re-pricing schema too", async () => {
    fakeNetwork(() => geminiReply({ priceLow: 16, priceHigh: 24, suggestedPrice: 20, priceReasoning: "Your similar thermals sold for $20." }));
    const { object } = await withModelFallback((model, abortSignal) =>
      generateObject({ model, abortSignal, maxRetries: 0, temperature: 0, schema: pricingSchema, prompt: "Price this item." }));
    expect(object.suggestedPrice).toBe(20);
    const config = calls[0].body.generationConfig as { responseSchema: { required: string[] } };
    expect(config.responseSchema.required).toEqual(["priceLow", "priceHigh", "suggestedPrice", "priceReasoning"]);
  });

  it("trims over-long lists (Gemini isn't told array lengths) instead of failing the call", async () => {
    fakeNetwork(() => geminiReply({ ...ANALYSIS, styles: ["Skater", "Indie", "Grunge", "Casual"], colors: ["Grey", "White", "Black"] }));
    const used: string[] = [];
    const { object } = await analyze((id) => used.push(id));
    expect(object.styles).toEqual(["Skater", "Indie", "Grunge"]);
    expect(object.colors).toEqual(["Grey", "White"]);
    expect(used).toEqual([DIRECT_LITE]);
    expect(calls).toHaveLength(1);
  });
});

describe("falling back from direct Gemini to the gateway", () => {
  it("moves past free-tier 429s on both direct models to the gateway, and says a backup wrote it", async () => {
    fakeNetwork(() => geminiError(429, "You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.", "GenerateRequestsPerMinutePerProjectPerModel-FreeTier"));
    const used: string[] = [];
    const { object } = await analyze((id) => used.push(id));
    expect(object.headline).toBe(`gateway ${PRIMARY_MODEL}`);
    expect(used).toEqual([PRIMARY_MODEL]);
    // One quick retry per direct model, no SDK-level retries on top.
    expect(calls.map((c) => c.url.match(/models\/([^:]+)/)![1])).toEqual(["gemini-3.5-flash-lite", "gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-3.8-flash"]);
    expect(modelNotice(used)).toMatch(/backup \(Claude Haiku\) wrote this listing/);
  }, 10_000);

  it("doesn't retry a used-up daily quota, and tries Flash next", async () => {
    fakeNetwork((model) => model === "gemini-3.5-flash-lite"
      ? geminiError(429, "You exceeded your current quota, please check your plan and billing details.", "GenerateRequestsPerDayPerProjectPerModel-FreeTier")
      : geminiReply(ANALYSIS));
    const used: string[] = [];
    await analyze((id) => used.push(id));
    expect(used).toEqual([DIRECT_FLASH]);
    expect(calls).toHaveLength(2);
    expect(modelNotice(used)).toBeNull(); // Flash is still the usual direct path
  });

  it("falls straight through on a rejected key or a server error", async () => {
    fakeNetwork((model) => model === "gemini-3.5-flash-lite"
      ? geminiError(400, "API key not valid. Please pass a valid API key.")
      : geminiError(500, "Internal error encountered."));
    const used: string[] = [];
    const { object } = await analyze((id) => used.push(id));
    expect(object.headline).toBe(`gateway ${PRIMARY_MODEL}`);
    expect(calls).toHaveLength(2);
  });

  it("falls through when Gemini's answer doesn't fit the schema", async () => {
    fakeNetwork(() => geminiReply({ headline: "half an answer" }));
    const used: string[] = [];
    await analyze((id) => used.push(id));
    expect(used).toEqual([PRIMARY_MODEL]);
  });
});
