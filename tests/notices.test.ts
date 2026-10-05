import { describe, it, expect } from "vitest";
import { friendlyError, modelNotice, searchNotice } from "@/lib/notices";
import { searchStatus } from "@/lib/comps";
import { clearedMessage } from "@/lib/savedFlag";
import { FALLBACK_MODELS, PRIMARY_MODEL } from "@/lib/model";

describe("model notice", () => {
  it("stays quiet on the usual models", () => {
    expect(modelNotice([FALLBACK_MODELS[0], FALLBACK_MODELS[0]])).toBeNull();
    expect(modelNotice([PRIMARY_MODEL])).toBeNull();
  });
  it("says when a backup wrote the listing", () => {
    expect(modelNotice([FALLBACK_MODELS[1], FALLBACK_MODELS[0]])).toMatch(/backup \(GPT-5 nano\) wrote this listing/);
  });
});

describe("Depop search status", () => {
  const base = { hasKey: true, errors: [] as string[], queries: 3, results: 40, parsed: 30, kept: true };
  it("tells a broken search from no matches", () => {
    expect(searchStatus(base)).toEqual({ state: "ok" });
    expect(searchStatus({ ...base, kept: false })).toEqual({ state: "no-matches" });
    expect(searchStatus({ ...base, results: 0, parsed: 0, kept: false })).toEqual({ state: "no-matches" });
    expect(searchStatus({ ...base, errors: ["402 out of credits", "x", "y"], results: 0, parsed: 0, kept: false })).toEqual({ state: "failed", detail: "402 out of credits" });
    expect(searchStatus({ ...base, hasKey: false })).toMatchObject({ state: "failed" });
    expect(searchStatus({ ...base, parsed: 0, kept: false })).toEqual({ state: "unreadable" });
  });
  it("explains what the price fell back to", () => {
    expect(searchNotice({ state: "ok" }, true)).toBeNull();
    expect(searchNotice({ state: "no-matches" }, true)).toBeNull();
    expect(searchNotice({ state: "failed", detail: "402 out of credits" }, true)).toMatch(/isn't working right now \(it's out of credits\), so the price is based on your own sales only/);
    expect(searchNotice({ state: "unreadable" }, false)).toMatch(/Depop may have changed its pages.*estimate from the photos/);
  });
});

describe("search error reasons", () => {
  it("are plain words", async () => {
    const { searchReason } = await import("@/lib/notices");
    expect(searchReason("Invalid API key. Provide a valid key using 'Authorization: Bearer <key>'")).toBe("its key isn't working");
    expect(searchReason("402 Payment Required: insufficient credits")).toBe("it's out of credits");
    expect(searchReason("fetch failed")).toBe("it isn't responding");
    expect(searchReason("the search key is missing")).toBe("it isn't set up");
  });
});

describe("whole-analysis errors", () => {
  it("are written for her, not as raw API errors", () => {
    expect(friendlyError(new Error("Insufficient credits on your AI Gateway account"))).toMatch(/used up its free credits/);
    expect(friendlyError(new Error("Rate limit exceeded"))).toMatch(/busy right now/);
    expect(friendlyError(new Error("Model not found"))).toMatch(/aren't responding/);
    expect(friendlyError(new Error("Invalid image: unsupported format"))).toMatch(/Invalid image/);
  });
});

describe("cleared data message", () => {
  it("names what was wiped", () => {
    expect(clearedMessage({ inventory: false, sales: false })).toBeNull();
    expect(clearedMessage({ inventory: true, sales: false })).toMatch(/^Your inventory sheet was cleared.*Load it again/);
    expect(clearedMessage({ inventory: true, sales: true })).toMatch(/inventory sheet and Depop sales.*Load them again/);
  });
});
