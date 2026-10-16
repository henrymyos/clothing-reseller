// Plain messages for her when SnapList had to work around something, so nothing
// changes silently: a backup AI model, a broken Depop search, a skipped price
// check, or the AI being unavailable altogether.
import { directGeminiEnabled, issueKind, usualModels } from "@/lib/model";
import type { SearchStatus } from "@/lib/comps";

// Direct Gemini (her own free Google key) and the Vercel AI Gateway can both run a
// Gemini Flash Lite, so the names say which route it was.
const NAMES: Record<string, string> = {
  "google-direct/gemini-3.5-flash-lite": "Gemini Flash Lite, direct from Google",
  "google-direct/gemini-3.8-flash": "Gemini Flash, direct from Google",
  "anthropic/claude-haiku-4-5": "Claude Haiku",
  "google/gemini-2.5-flash-lite": "Gemini Flash Lite via Vercel",
  "openai/gpt-5-nano": "GPT-5 nano",
  "google/gemini-3.1-flash-lite": "Gemini 3.1 Flash Lite",
};
export const modelName = (id: string) => NAMES[id] ?? id;

export function modelNotice(used: string[]): string | null {
  const usual = usualModels();
  const backups = [...new Set(used.filter((m) => !usual.includes(m)))];
  if (!backups.length) return null;
  return `The usual AI model isn't responding, so a backup (${backups.map(modelName).join(", ")}) wrote this listing. Double-check the details before posting. If you keep seeing this, let Henry know.`;
}

// The search service's raw error, in a few plain words.
export function searchReason(detail: string): string {
  if (/missing/i.test(detail)) return "it isn't set up";
  if (/api key|unauthori[sz]ed|\b401\b|\b403\b|forbidden/i.test(detail)) return "its key isn't working";
  if (/credit|quota|balance|payment|billing|\b402\b|limit reached/i.test(detail)) return "it's out of credits";
  if (/rate|too many|\b429\b/i.test(detail)) return "it's busy";
  if (/timeout|timed out|ETIMEDOUT|ECONN|fetch failed|network/i.test(detail)) return "it isn't responding";
  return "it returned an error";
}

export function searchNotice(s: SearchStatus, hasOwnSales: boolean): string | null {
  const fallback = hasOwnSales ? "so the price is based on your own sales only" : "so the price is only an estimate from the photos — check Depop before pricing";
  if (s.state === "failed") return `The Depop price search isn't working right now (${searchReason(s.detail)}), ${fallback}. If it keeps happening, let Henry know.`;
  if (s.state === "unreadable") return `SnapList found Depop listings but couldn't read them — Depop may have changed its pages — ${fallback}. Let Henry know.`;
  return null;
}

export const PRICE_CHECK_SKIPPED =
  "The AI's price check didn't finish, so this price is the photo estimate held to your sales and the matching listings. Re-analyze for a fully checked price.";

// Turn a failure of the whole analysis into something she can act on.
export function friendlyError(e: unknown): string {
  const kind = issueKind(e);
  if (kind === "tier")
    return directGeminiEnabled()
      ? "SnapList's AI has used up today's free Google requests and the Vercel backup is out of credits, so it can't write listings right now. Google's free requests reset overnight (midnight Pacific); if it's still stuck tomorrow, let Henry know."
      : "SnapList's AI has used up its free credits for now, so it can't write listings. Let Henry know — he can add credits in Vercel or set up the free Google key.";
  if (kind === "rate") return "The AI is busy right now. Wait a minute and try again.";
  if (kind === "slow" || kind === "down") return "The AI models aren't responding right now. Try again in a few minutes; if it keeps happening, let Henry know.";
  const msg = e instanceof Error ? e.message : "";
  return msg ? `Something went wrong analyzing the photos: ${msg.slice(0, 160)}` : "Something went wrong analyzing the photos.";
}
