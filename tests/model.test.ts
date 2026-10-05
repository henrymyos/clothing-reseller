import { describe, it, expect, vi } from "vitest";
import { withModelFallback, PRIMARY_MODEL, FALLBACK_MODELS } from "@/lib/model";

describe("model fallback", () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});

  it("moves on when a model is retired or its provider is down", async () => {
    const tried: string[] = [];
    const out = await withModelFallback(async (m) => {
      tried.push(m);
      if (m === PRIMARY_MODEL) throw new Error("Free tier does not include this model");
      if (m === FALLBACK_MODELS[0]) throw new Error("Model google/gemini-2.5-flash-lite not found");
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
