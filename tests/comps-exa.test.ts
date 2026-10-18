import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Analysis } from "@/lib/schema";
import { getDepopComps } from "@/lib/comps";

// Exa cost trim: 10 results, at most 2 queries, a 24 h per-query cache. Exa is mocked.
const exaSearch = vi.fn();
vi.mock("exa-js", () => ({ default: class { search = exaSearch; } }));

const result = (i: number) => ({
  url: `https://www.depop.com/products/seller-item-${i}/`,
  title: `Gildan hoodie ${i} | Depop`,
  text: `# Gildan Men's Black Hoodie $${20 + i}.00 Size L Good condition`,
});

// Each test uses its own queries so the module-level cache doesn't leak between them.
function analysis(tag: string): Analysis {
  return {
    itemType: "Hoodie", brand: "Gildan", brandTier: "blank", distinctiveFeatures: [],
    searchQuery: `gildan ${tag} hoodie`, searchQueryBroad: `${tag} hoodie`,
  } as unknown as Analysis;
}

describe("getDepopComps Exa usage", () => {
  beforeEach(() => {
    vi.stubEnv("EXA_API_KEY", "test-key-not-real");
    exaSearch.mockReset().mockResolvedValue({ results: [1, 2, 3, 4].map(result) });
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it("asks Exa for 10 results per search", async () => {
    await getDepopComps(analysis("cap"));
    for (const [, opts] of exaSearch.mock.calls) expect(opts.numResults).toBe(10);
  });

  it("runs at most 2 queries even when brand + type is a third distinct query", async () => {
    const { search } = await getDepopComps(analysis("three"));
    expect(exaSearch).toHaveBeenCalledTimes(2);
    expect(exaSearch.mock.calls.map((c) => c[0])).toEqual(["gildan three hoodie", "three hoodie"]);
    expect(search.state).toBe("ok");
  });

  it("serves a repeat query from the cache, normalized for case and spacing", async () => {
    const first = await getDepopComps(analysis("hit"));
    const again = analysis("hit");
    again.searchQuery = "  Gildan   HIT hoodie ";
    again.searchQueryBroad = "HIT Hoodie";
    const second = await getDepopComps(again);
    expect(exaSearch).toHaveBeenCalledTimes(2);
    expect(second.comps?.median).toBe(first.comps?.median);
  });

  it("searches again once the cached entry is over 24 hours old", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-18T00:00:00Z"));
    await getDepopComps(analysis("expiry"));
    vi.setSystemTime(new Date("2026-10-18T23:59:00Z"));
    await getDepopComps(analysis("expiry"));
    expect(exaSearch).toHaveBeenCalledTimes(2);
    vi.setSystemTime(new Date("2026-10-19T00:01:00Z"));
    await getDepopComps(analysis("expiry"));
    expect(exaSearch).toHaveBeenCalledTimes(4);
  });

  it("doesn't cache a failed search", async () => {
    exaSearch.mockRejectedValueOnce(new Error("You have exceeded your credits limit"));
    await getDepopComps(analysis("fail"));
    await getDepopComps(analysis("fail"));
    // Only the query that failed is searched again; the other comes from the cache.
    expect(exaSearch).toHaveBeenCalledTimes(3);
    expect(exaSearch.mock.calls[2][0]).toBe("gildan fail hoodie");
  });
});
