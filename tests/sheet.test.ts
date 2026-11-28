import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/sheet/route";

// No real Google calls: fetch is stubbed per test.
const link = "https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwxyz/edit#gid=7";
const req = (url: string) => new NextRequest(`http://localhost/api/sheet?url=${encodeURIComponent(url)}`);
const csv = (body: BodyInit, headers: Record<string, string> = {}) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { headers: { "content-type": "text/csv", ...headers } })));

afterEach(() => vi.unstubAllGlobals());

describe("GET /api/sheet", () => {
  it("refuses links that aren't Google Sheets, without fetching", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect((await GET(req("https://example.com/x.csv"))).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });
  it("returns the sheet's CSV from its export URL", async () => {
    csv("title,price\nTee,12\n");
    const res = await GET(req(link));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("title,price\nTee,12\n");
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain("/export?format=csv&gid=7");
  });
  it("says private when Google answers with a sign-in page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { headers: { "content-type": "text/html" } })));
    expect((await GET(req(link))).status).toBe(403);
  });
  it("rejects a sheet over 2 MB from its content-length", async () => {
    csv("x", { "content-length": "2000001" });
    expect((await GET(req(link))).status).toBe(413);
  });
  it("stops reading a streamed sheet once it passes 2 MB", async () => {
    let pulled = 0;
    const chunk = new Uint8Array(500_000).fill(97);
    const stream = new ReadableStream({
      pull(c) { pulled++; if (pulled > 20) c.close(); else c.enqueue(chunk); },
    });
    csv(stream);
    expect((await GET(req(link))).status).toBe(413);
    expect(pulled).toBeLessThan(10);
  });
});
