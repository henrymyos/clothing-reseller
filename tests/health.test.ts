import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { summarizeHealth } from "@/lib/health";

// No real AI or Exa calls: both are mocked. Exa fails the way it does when credits run out.
const exaSearch = vi.fn();
const generateText = vi.fn();
vi.mock("exa-js", () => ({ default: class { search = exaSearch; } }));
vi.mock("ai", async (orig) => ({ ...(await orig<typeof import("ai")>()), generateText }));

const up = { ok: true, detail: "fine" };
const down = { ok: false, detail: "broken" };

describe("health summary", () => {
  it("is healthy when everything works", () => {
    expect(summarizeHealth({ ai: up, exa: up, depop: up })).toMatchObject({ ok: true, degraded: [], status: 200 });
  });
  it("is degraded, not down, when only the Depop search fails", () => {
    const s = summarizeHealth({ ai: up, exa: down, depop: { ok: false, skipped: true, detail: "not checked" } });
    expect(s).toMatchObject({ ok: true, degraded: ["exa"], status: 200 });
    expect(s.cacheControl).toMatch(/s-maxage=3600/);
  });
  it("lists Depop parsing when the search works but pages can't be read", () => {
    expect(summarizeHealth({ ai: up, exa: up, depop: down })).toMatchObject({ ok: true, degraded: ["depop"], status: 200 });
  });
  it("is down when the AI fails, and isn't cached", () => {
    expect(summarizeHealth({ ai: down, exa: up, depop: up })).toMatchObject({ ok: false, status: 503, cacheControl: "no-store" });
    expect(summarizeHealth({ ai: down, exa: down, depop: down })).toMatchObject({ ok: false, status: 503, degraded: ["exa", "depop"] });
  });
  it("caches a healthy answer for 12 hours", () => {
    expect(summarizeHealth({ ai: up, exa: up, depop: up }).cacheControl).toMatch(/s-maxage=43200/);
  });
});

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.stubEnv("EXA_API_KEY", "test-key-not-real");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
    exaSearch.mockReset();
    generateText.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("answers 200 ok with degraded: [exa] when Exa is out of credits", async () => {
    generateText.mockResolvedValue({ text: "OK" });
    exaSearch.mockRejectedValue(new Error("You have exceeded your credits limit"));
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, degraded: ["exa"] });
    expect(body.checks.exa).toMatchObject({ ok: false, detail: expect.stringMatching(/credits limit/) });
    expect(body.checks.ai.ok).toBe(true);
  });

  it("answers 503 when the AI is down", async () => {
    generateText.mockRejectedValue(new Error("Model not found"));
    exaSearch.mockRejectedValue(new Error("You have exceeded your credits limit"));
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false });
  });
});
