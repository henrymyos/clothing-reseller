// Vision-capable model routed through the Vercel AI Gateway (needs AI_GATEWAY_API_KEY
// locally, or OIDC when running on Vercel / via `vercel dev`).
export const PRIMARY_MODEL = "anthropic/claude-haiku-4-5";

// Multimodal models available on the gateway's free tier, tried in order when a model
// is rejected as tier-restricted or rate-limited (e.g. no paid credits on the team).
// Different providers so one model's free-tier rate limit doesn't sink the whole chain.
// Several, so a retired model or one provider's outage can't take the app down.
export const FALLBACK_MODELS = ["google/gemini-2.5-flash-lite", "openai/gpt-5-nano", "google/gemini-3.1-flash-lite"];

// A model the gateway refused for the billing tier stays refused for a while —
// remember that so every call doesn't spend a round trip rediscovering it.
// Rate limits are temporary, so those are only skipped briefly.
const TIER_SKIP_MS = 15 * 60 * 1000;
const RATE_SKIP_MS = 20 * 1000;
const DOWN_SKIP_MS = 5 * 60 * 1000;
const skipUntil = new Map<string, number>();

// Why a model call failed. Anything that isn't about the request itself (a bad
// image, an invalid schema) counts as the model being down — retired, provider
// outage, out of credits — so the next model gets a turn.
function issueKind(e: unknown): "tier" | "rate" | "slow" | "down" | null {
  if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) return "slow";
  const msg = e instanceof Error ? e.message : String(e);
  if (/rate.?limit|too many requests|\b429\b/i.test(msg)) return "rate";
  if (/free tier|no_providers_available|credit|insufficient|quota|payment|billing/i.test(msg)) return "tier";
  if (/invalid.*image|image.*(too large|invalid|unsupported)|payload too large|\b413\b/i.test(msg)) return null;
  return "down";
}

/**
 * Runs a model call with PRIMARY_MODEL, falling through FALLBACK_MODELS when the
 * gateway rejects a model as unavailable or rate-limited on the current billing tier,
 * or when a call hangs past `timeoutMs` (free-tier requests occasionally queue for
 * a minute — abandoning them keeps the whole request inside the function limit).
 */
export async function withModelFallback<T>(
  run: (model: string, abortSignal: AbortSignal) => Promise<T>,
  { timeoutMs = 25_000, maxAttempts = Infinity }: { timeoutMs?: number; maxAttempts?: number } = {}
): Promise<T> {
  const chain = [PRIMARY_MODEL, ...FALLBACK_MODELS];
  const now = Date.now();
  const usable = chain.filter((m) => (skipUntil.get(m) ?? 0) <= now);
  let lastError: unknown;
  for (const model of (usable.length ? usable : chain).slice(0, maxAttempts)) {
    const t = Date.now();
    try {
      let out: T;
      try {
        out = await run(model, AbortSignal.timeout(timeoutMs));
      } catch (e) {
        // A rate limit usually clears in a moment — wait briefly and retry once.
        if (issueKind(e) !== "rate") throw e;
        await new Promise((r) => setTimeout(r, 1200));
        out = await run(model, AbortSignal.timeout(timeoutMs));
      }
      console.log(`model ${model} ok in ${Date.now() - t}ms`);
      return out;
    } catch (e) {
      const kind = issueKind(e);
      if (!kind) throw e;
      lastError = e;
      skipUntil.set(model, Date.now() + (kind === "tier" ? TIER_SKIP_MS : kind === "down" ? DOWN_SKIP_MS : RATE_SKIP_MS));
      const why = kind === "tier" ? "unavailable on this AI Gateway tier" : kind === "rate" ? "rate-limited" : kind === "down" ? `failed (${e instanceof Error ? e.message.slice(0, 120) : "error"})` : "timed out";
      console.warn(`${model} ${why} (${Date.now() - t}ms), trying next fallback`);
    }
  }
  throw lastError;
}
