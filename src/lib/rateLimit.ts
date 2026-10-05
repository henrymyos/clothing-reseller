// A light per-IP limit so a bot hammering the public URL can't burn through the
// free AI and search credits. In-memory per server instance, so it's approximate —
// enough to stop a runaway script without getting in her way.
const hits = new Map<string, number[]>();

export function rateLimited(ip: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) { hits.set(ip, recent); return true; }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return false;
}

export function clientIp(headers: Headers): string {
  return (headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || headers.get("x-real-ip") || "unknown";
}
