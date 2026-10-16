import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  withModelFallback, modelChain, usualModels, issueKind, resetModelSkips,
  PRIMARY_MODEL, FALLBACK_MODELS, GATEWAY_MODELS, DIRECT_MODEL_IDS,
} from "@/lib/model";

// No test here makes a real AI call: `run` is always a stub that never touches the network.
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});

const [DIRECT_LITE, DIRECT_FLASH] = DIRECT_MODEL_IDS;

// Shaped like the AI SDK's APICallError from a Google free-tier 429.
function google429(perDay: boolean) {
  const quotaId = perDay ? "GenerateRequestsPerDayPerProjectPerModel-FreeTier" : "GenerateRequestsPerMinutePerProjectPerModel-FreeTier";
  return Object.assign(
    new Error("You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits."),
    { name: "AI_APICallError", statusCode: 429, responseBody: JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED", details: [{ violations: [{ quotaId }] }] } }) },
  );
}

beforeEach(() => {
  resetModelSkips();
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("model chain", () => {
  it("is the gateway chain, unchanged, without a Google key", () => {
    const chain = modelChain();
    expect(chain.map((m) => m.id)).toEqual(GATEWAY_MODELS);
    expect(chain.map((m) => m.model)).toEqual(GATEWAY_MODELS); // plain gateway id strings
    expect(usualModels()).toEqual([PRIMARY_MODEL, FALLBACK_MODELS[0]]);
  });

  it("puts direct Gemini (Flash Lite, then Flash) ahead of the gateway when the key is set", () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-key-not-real");
    const chain = modelChain();
    expect(chain.map((m) => m.id)).toEqual([DIRECT_LITE, DIRECT_FLASH, ...GATEWAY_MODELS]);
    const direct = chain[0].model as { modelId: string; provider: string };
    expect(direct.modelId).toBe("gemini-2.5-flash-lite");
    expect(direct.provider).toMatch(/google/);
    expect((chain[1].model as { modelId: string }).modelId).toBe("gemini-2.5-flash");
    expect(chain.slice(2).map((m) => m.model)).toEqual(GATEWAY_MODELS);
    expect(usualModels()).toEqual(DIRECT_MODEL_IDS);
  });

  it("treats a blank key as no key", () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "   ");
    expect(modelChain().map((m) => m.id)).toEqual(GATEWAY_MODELS);
  });
});

describe("model fallback without a Google key (as before)", () => {
  it("moves on when a model is retired or its provider is down", async () => {
    const tried: string[] = [];
    const out = await withModelFallback(async (m, _s, id) => {
      tried.push(id);
      expect(m).toBe(id); // gateway models are passed as id strings
      if (id === PRIMARY_MODEL) throw new Error("Free tier does not include this model");
      if (id === FALLBACK_MODELS[0]) throw new Error("Model google/gemini-2.5-flash-lite not found");
      return "ok";
    });
    expect(out).toBe("ok");
    expect(tried).toEqual([PRIMARY_MODEL, FALLBACK_MODELS[0], FALLBACK_MODELS[1]]);
  });

  it("doesn't cycle through every model for a bad request", async () => {
    let calls = 0;
    await expect(withModelFallback(async () => { calls++; throw new Error("Invalid image: unsupported format"); })).rejects.toThrow(/Invalid image/);
    expect(calls).toBe(1);
  });
});

describe("model fallback with a Google key", () => {
  beforeEach(() => vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-key-not-real"));

  it("uses direct Gemini Flash Lite first and reports it", async () => {
    const tried: string[] = [];
    const used: string[] = [];
    const out = await withModelFallback(async (m, _s, id) => { tried.push(id); expect(typeof m).toBe("object"); return "listing"; }, { onModel: (id) => used.push(id) });
    expect(out).toBe("listing");
    expect(tried).toEqual([DIRECT_LITE]);
    expect(used).toEqual([DIRECT_LITE]);
  });

  it("falls through to the gateway when both direct models are rate-limited (one quick retry each)", async () => {
    const tried: string[] = [];
    const out = await withModelFallback(async (_m, _s, id) => {
      tried.push(id);
      if (id.startsWith("google-direct/")) throw google429(false);
      return `from ${id}`;
    });
    expect(out).toBe(`from ${PRIMARY_MODEL}`);
    expect(tried).toEqual([DIRECT_LITE, DIRECT_LITE, DIRECT_FLASH, DIRECT_FLASH, PRIMARY_MODEL]);
  }, 10_000);

  it("skips a used-up daily quota without retrying, and remembers it on the next call", async () => {
    const tried: string[] = [];
    const run = async (_m: unknown, _s: AbortSignal, id: string) => {
      tried.push(id);
      if (id === DIRECT_LITE) throw google429(true);
      if (id === DIRECT_FLASH) throw new Error("Service Unavailable: the model is overloaded");
      if (id === PRIMARY_MODEL) throw new Error("Insufficient credits on your AI Gateway account");
      return `from ${id}`;
    };
    expect(await withModelFallback(run)).toBe(`from ${FALLBACK_MODELS[0]}`);
    expect(tried).toEqual([DIRECT_LITE, DIRECT_FLASH, PRIMARY_MODEL, FALLBACK_MODELS[0]]);

    tried.length = 0;
    expect(await withModelFallback(run)).toBe(`from ${FALLBACK_MODELS[0]}`);
    expect(tried).toEqual([FALLBACK_MODELS[0]]); // the three failed models are skipped for now
  });

  it("falls through when direct Gemini times out or the key is rejected", async () => {
    const tried: string[] = [];
    const out = await withModelFallback(async (_m, _s, id) => {
      tried.push(id);
      if (id === DIRECT_LITE) throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
      if (id === DIRECT_FLASH) throw Object.assign(new Error("API key not valid. Please pass a valid API key."), { statusCode: 400 });
      return `from ${id}`;
    });
    expect(out).toBe(`from ${PRIMARY_MODEL}`);
    expect(tried).toEqual([DIRECT_LITE, DIRECT_FLASH, PRIMARY_MODEL]);
  });

  it("still stops on a bad request instead of trying every model", async () => {
    let calls = 0;
    await expect(withModelFallback(async () => { calls++; throw new Error("Invalid image: unsupported format"); })).rejects.toThrow(/Invalid image/);
    expect(calls).toBe(1);
  });
});

describe("issue kinds", () => {
  it("tells Google's per-minute and per-day 429s apart", () => {
    expect(issueKind(google429(false))).toBe("rate");
    expect(issueKind(google429(true))).toBe("tier");
    // The AI SDK's retry wrapper keeps the real error as lastError.
    expect(issueKind(Object.assign(new Error("Failed after 3 attempts. Last error: You exceeded your current quota"), { lastError: google429(true) }))).toBe("tier");
  });
  it("keeps the gateway's classifications", () => {
    expect(issueKind(new Error("Rate limit exceeded"))).toBe("rate");
    expect(issueKind(new Error("Insufficient credits on your AI Gateway account"))).toBe("tier");
    expect(issueKind(new Error("Model not found"))).toBe("down");
    expect(issueKind(new Error("Invalid image: unsupported format"))).toBeNull();
  });
});
