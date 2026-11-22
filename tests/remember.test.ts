import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/remember/route";

const post = (body: string) => POST(new NextRequest("https://x.test/api/remember", { method: "POST", body }));

describe("remember route", () => {
  it("sets the cookie for what was loaded", async () => {
    const res = await post(JSON.stringify({ inventory: true, sales: false }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/snaplist_saved=inventory;/);
  });
  it("treats a null or broken body as nothing loaded instead of failing", async () => {
    for (const body of ["null", "{not json"]) {
      const res = await post(body);
      expect(res.status).toBe(200);
      expect(res.headers.get("set-cookie")).toMatch(/snaplist_saved=;/);
    }
  });
});
