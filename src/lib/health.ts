// How /api/health turns its checks into one answer for the uptime monitor.
// Only the AI is core: without it SnapList can't write a listing at all. The Depop
// price search (Exa) and reading Depop's pages only feed price comps, and the app
// already writes listings without them, so their failure is "degraded", not down.
// A degraded answer is HTTP 200 (no uptime alert) but names what's off.

export type Check = { ok: boolean; detail: string; skipped?: boolean };

export const CORE_CHECKS = ["ai"] as const;

export type HealthSummary = {
  ok: boolean;
  degraded: string[];
  status: 200 | 503;
  cacheControl: string;
};

const HEALTHY_CACHE = "public, s-maxage=43200, stale-while-revalidate=3600"; // 12 h: ~2 real checks a day
const DEGRADED_CACHE = "public, s-maxage=3600, stale-while-revalidate=600"; // 1 h: a recovery shows up soon

export function summarizeHealth(checks: Record<string, Check>): HealthSummary {
  const core = new Set<string>(CORE_CHECKS);
  const coreOk = Object.entries(checks).every(([name, c]) => !core.has(name) || c.ok);
  // A check that never ran (Depop parsing when the search itself failed) isn't listed:
  // the search is the thing that's broken.
  const degraded = Object.entries(checks)
    .filter(([name, c]) => !core.has(name) && !c.ok && !c.skipped)
    .map(([name]) => name);
  if (!coreOk) return { ok: false, degraded, status: 503, cacheControl: "no-store" };
  return { ok: true, degraded, status: 200, cacheControl: degraded.length ? DEGRADED_CACHE : HEALTHY_CACHE };
}
