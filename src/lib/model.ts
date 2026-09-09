// Vision-capable model routed through the Vercel AI Gateway (needs AI_GATEWAY_API_KEY
// locally, or OIDC when running on Vercel / via `vercel dev`).
export const PRIMARY_MODEL = "anthropic/claude-haiku-4-5";

// Multimodal models available on the gateway's free tier, tried in order when a model
// is rejected as tier-restricted or rate-limited (e.g. no paid credits on the team).
// Different providers so one model's free-tier rate limit doesn't sink the whole chain.
export const FALLBACK_MODELS = ["google/gemini-2.5-flash-lite", "openai/gpt-5-nano"];

function isTierOrRateIssue(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /free tier|no_providers_available|rate.?limit/i.test(msg);
}

/**
 * Runs a model call with PRIMARY_MODEL, falling through FALLBACK_MODELS when the
 * gateway rejects a model as unavailable or rate-limited on the current billing tier.
 */
export async function withModelFallback<T>(run: (model: string) => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (const model of [PRIMARY_MODEL, ...FALLBACK_MODELS]) {
    try {
      return await run(model);
    } catch (e) {
      if (!isTierOrRateIssue(e)) throw e;
      lastError = e;
      console.warn(`${model} unavailable on this AI Gateway tier, trying next fallback`);
    }
  }
  throw lastError;
}
