import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

// Two ways to reach a model:
// 1. Direct Gemini — Google's Gemini API with a free Google AI Studio key
//    (GOOGLE_GENERATIVE_AI_API_KEY). Tried first whenever that key is set.
// 2. The Vercel AI Gateway (AI_GATEWAY_API_KEY locally, or OIDC on Vercel / `vercel dev`),
//    which draws on the team's gateway credit. The only route when there's no Google key,
//    and the backup when there is one.

// Direct-Gemini models, vision-capable and on Google's free tier, in order. Their ids
// are tagged "google-direct/…" so they never collide with the gateway's "google/…" ids
// in logs, skip timers or the notices.
export const DIRECT_PREFIX = "google-direct/";
export const DIRECT_GEMINI_MODELS = ["gemini-2.5-flash-lite", "gemini-2.5-flash"];
export const DIRECT_MODEL_IDS = DIRECT_GEMINI_MODELS.map((m) => DIRECT_PREFIX + m);
export const isDirectModel = (id: string) => id.startsWith(DIRECT_PREFIX);

// Gateway: Claude Haiku first (needs paid gateway credit).
export const PRIMARY_MODEL = "anthropic/claude-haiku-4-5";

// Multimodal models available on the gateway's free tier, tried in order when a model
// is rejected as tier-restricted or rate-limited (e.g. no paid credits on the team).
// Different providers so one model's free-tier rate limit doesn't sink the whole chain.
// Several, so a retired model or one provider's outage can't take the app down.
export const FALLBACK_MODELS = ["google/gemini-2.5-flash-lite", "openai/gpt-5-nano", "google/gemini-3.1-flash-lite"];
export const GATEWAY_MODELS = [PRIMARY_MODEL, ...FALLBACK_MODELS];

export const directGeminiEnabled = () => !!process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();

// What normally runs. With a Google key: direct Gemini (either model). Without one:
// Claude when there are paid gateway credits, else Gemini Flash Lite on the gateway's
// free tier. Anything past these is a backup, and the app says so.
export function usualModels(): string[] {
  return directGeminiEnabled() ? DIRECT_MODEL_IDS : [PRIMARY_MODEL, FALLBACK_MODELS[0]];
}

export type ChainModel = { id: string; model: LanguageModel };

// The models to try, in order. Read on every call so adding or removing the key
// takes effect without code changes.
export function modelChain(): ChainModel[] {
  const gateway = GATEWAY_MODELS.map((id) => ({ id, model: id }));
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!apiKey) return gateway;
  const google = createGoogleGenerativeAI({ apiKey });
  return [...DIRECT_GEMINI_MODELS.map((m) => ({ id: DIRECT_PREFIX + m, model: google(m) })), ...gateway];
}

// A model the gateway refused for the billing tier stays refused for a while —
// remember that so every call doesn't spend a round trip rediscovering it.
// Rate limits are temporary, so those are only skipped briefly.
const TIER_SKIP_MS = 15 * 60 * 1000;
const RATE_SKIP_MS = 20 * 1000;
const DOWN_SKIP_MS = 5 * 60 * 1000;
const skipUntil = new Map<string, number>();

/** Forget every skipped model (tests). */
export function resetModelSkips() {
  skipUntil.clear();
}

function errorField(e: unknown, key: string): unknown {
  return e && typeof e === "object" && key in e ? (e as Record<string, unknown>)[key] : undefined;
}

// Why a model call failed. Anything that isn't about the request itself (a bad
// image, an invalid schema) counts as the model being down — retired, provider
// outage, out of credits — so the next model gets a turn.
export function issueKind(e: unknown): "tier" | "rate" | "slow" | "down" | null {
  if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) return "slow";
  const msg = e instanceof Error ? e.message : String(e);
  // The AI SDK's retry wrapper keeps the real error underneath.
  const inner = errorField(e, "lastError");
  const status = errorField(e, "statusCode") ?? errorField(inner, "statusCode");
  const body = String(errorField(e, "responseBody") ?? errorField(inner, "responseBody") ?? "");
  // Google's free tier answers 429 both for "too many this minute" and "used up today's
  // requests"; only the second names a per-day quota. A daily quota won't clear in
  // seconds, so skip that model for a while rather than retrying it.
  if (/PerDay|per day|daily/i.test(`${msg} ${body}`) && (status === 429 || /quota|\b429\b/i.test(msg))) return "tier";
  if (status === 429 || /rate.?limit|too many requests|\b429\b/i.test(msg)) return "rate";
  if (/free tier|no_providers_available|credit|insufficient|quota|payment|billing/i.test(msg)) return "tier";
  if (/invalid.*image|image.*(too large|invalid|unsupported)|payload too large|\b413\b/i.test(msg)) return null;
  return "down";
}

/**
 * Runs a model call down modelChain(): direct Gemini first when GOOGLE_GENERATIVE_AI_API_KEY
 * is set, then the gateway's PRIMARY_MODEL and FALLBACK_MODELS. Moves on when a model is
 * unavailable on the current tier or quota, rate-limited, down, or hangs past `timeoutMs`
 * (free-tier requests occasionally queue for a minute — abandoning them keeps the whole
 * request inside the function limit). `run` gets the model to pass to the AI SDK (a
 * gateway id string or a provider model object) and its tagged id for logging.
 */
export async function withModelFallback<T>(
  run: (model: LanguageModel, abortSignal: AbortSignal, id: string) => Promise<T>,
  { timeoutMs = 25_000, maxAttempts = Infinity, onModel }: { timeoutMs?: number; maxAttempts?: number; onModel?: (id: string) => void } = {}
): Promise<T> {
  const chain = modelChain();
  const now = Date.now();
  const usable = chain.filter((m) => (skipUntil.get(m.id) ?? 0) <= now);
  let lastError: unknown;
  for (const { id, model } of (usable.length ? usable : chain).slice(0, maxAttempts)) {
    const t = Date.now();
    try {
      let out: T;
      try {
        out = await run(model, AbortSignal.timeout(timeoutMs), id);
      } catch (e) {
        // A rate limit usually clears in a moment — wait briefly and retry once.
        if (issueKind(e) !== "rate") throw e;
        await new Promise((r) => setTimeout(r, 1200));
        out = await run(model, AbortSignal.timeout(timeoutMs), id);
      }
      console.log(`model ${id} ok in ${Date.now() - t}ms`);
      onModel?.(id);
      return out;
    } catch (e) {
      const kind = issueKind(e);
      if (!kind) throw e;
      lastError = e;
      skipUntil.set(id, Date.now() + (kind === "tier" ? TIER_SKIP_MS : kind === "down" ? DOWN_SKIP_MS : RATE_SKIP_MS));
      const where = isDirectModel(id) ? "Google's free tier" : "this AI Gateway tier";
      const why = kind === "tier" ? `unavailable on ${where}` : kind === "rate" ? "rate-limited" : kind === "down" ? `failed (${e instanceof Error ? e.message.slice(0, 120) : "error"})` : "timed out";
      console.warn(`${id} ${why} (${Date.now() - t}ms), trying next fallback`);
    }
  }
  throw lastError;
}
