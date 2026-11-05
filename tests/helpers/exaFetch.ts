import { vi, type Mock } from "vitest";

// Answers fetch to Exa's /search from search(query, body); a rejection becomes Exa's JSON error reply.
export function stubExaFetch(search: Mock) {
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    if (url !== "https://api.exa.ai/search") throw new Error(`unexpected fetch ${url}`);
    const body = JSON.parse(String(init.body));
    try { return Response.json(await search(body.query, body)); }
    catch (e) { return Response.json({ error: (e as Error).message }, { status: 402 }); }
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
