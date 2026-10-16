"use client";

// "Styled photos (free)": a ready-to-paste prompt for an on-model shot and a
// flat-lay outfit, filled from the item's analysis. She copies it, opens the
// Gemini (or ChatGPT) app, attaches her own photo and pastes. SnapList makes no
// network call here, costs nothing and stores nothing new.
import { useMemo, useRef, useState } from "react";
import { Label } from "@/components/ui";
import {
  CHATGPT_URL, DEFAULT_STYLE_CHIP, GEMINI_URL, STYLE_CHIPS, buildStylePrompts,
  type PromptItem, type StyleChip,
} from "@/lib/stylePrompts";

type Shot = "onModel" | "flatLay";
const TABS: { id: Shot; label: string }[] = [
  { id: "onModel", label: "On a model" },
  { id: "flatLay", label: "Flat-lay outfit" },
];

export function StyledPhotos({ item, fromNotes = false }: { item: PromptItem; fromNotes?: boolean }) {
  const [style, setStyle] = useState<StyleChip>(DEFAULT_STYLE_CHIP);
  const prompts = useMemo(() => buildStylePrompts(item, style), [item, style]);
  const [shot, setShot] = useState<Shot>(prompts.kids ? "flatLay" : "onModel");
  const text = shot === "onModel" ? prompts.onModel : prompts.flatLay;

  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface p-5 card-shadow" data-testid="styled-photos">
      <div className="flex items-baseline justify-between gap-3">
        <Label>Styled photos (free)</Label>
        <span className="text-xs text-muted">Pinterest 2:3 · no face</span>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        Get a photo of this exact item on a model or styled in a flat-lay, made for free in the Gemini app.
      </p>
      {fromNotes && (
        <p className="mt-2 rounded-lg bg-honey-soft px-3 py-2 text-xs text-ink-soft">
          The analysis didn&apos;t finish, so these prompts use what you typed in the notes. Add the item type and colour there for a better result.
        </p>
      )}

      <div role="tablist" aria-label="Kind of styled photo" className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-cream p-1">
        {TABS.map((t) => (
          <button
            key={t.id} type="button" role="tab" id={`styled-tab-${t.id}`} aria-selected={shot === t.id} aria-controls="styled-panel"
            onClick={() => setShot(t.id)}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${shot === t.id ? "bg-surface text-cherry shadow-sm" : "text-ink-soft hover:text-ink"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="styled-panel" aria-labelledby={`styled-tab-${shot}`} className="mt-3">
        {shot === "flatLay" && (
          <div>
            <p className="text-xs font-medium text-muted">Outfit style</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {STYLE_CHIPS.map((s) => (
                <button key={s} type="button" aria-pressed={style === s} onClick={() => setStyle(s)}
                  className={`rounded-full border px-3 py-1 text-xs ${style === s ? "border-cherry bg-cherry text-white" : "border-line-strong bg-surface"}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {text ? (
          <PromptBox key={`${shot}-${style}`} text={text} />
        ) : (
          <p className="mt-1 rounded-xl bg-cream p-3 text-sm text-ink-soft">
            On-model photos are off for kids&apos; items. Use the flat-lay outfit instead.
          </p>
        )}
      </div>

      <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-ink-soft">
        <li>Copy the prompt.</li>
        <li>Open Gemini and attach your item photo (the front one works best).</li>
        <li>Paste and send, then save the image.</li>
      </ol>

      <div className="mt-3 flex flex-wrap gap-2">
        <a href={GEMINI_URL} target="_blank" rel="noopener noreferrer"
          className="rounded-lg border border-cherry bg-surface px-3 py-1.5 text-sm font-semibold text-cherry hover:bg-blush">
          Open Gemini ↗
        </a>
        <a href={CHATGPT_URL} target="_blank" rel="noopener noreferrer"
          className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-blush">
          Or ChatGPT ↗
        </a>
      </div>

      <div className="mt-4 space-y-1 border-t border-line pt-3 text-xs text-muted">
        <p>The free Gemini app makes roughly 20 images a day. Check the photo matches your item before you use it.</p>
        <p>Tip: on Pinterest, turn on the &ldquo;AI-modified&rdquo; label when you post. On Depop, keep your real photo first.</p>
      </div>
    </div>
  );
}

// The prompt, plus a Copy button that falls back to selecting the text when the
// clipboard API is blocked (older iOS, http, some in-app browsers).
function PromptBox({ text }: { text: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [state, setState] = useState<"idle" | "copied" | "selected">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.select();
      el.setSelectionRange(0, text.length);
      let ok = false;
      try { ok = document.execCommand("copy"); } catch { /* not supported */ }
      setState(ok ? "copied" : "selected");
    }
    setTimeout(() => setState((s) => (s === "copied" ? "idle" : s)), 1600);
  }

  return (
    <div className="mt-3">
      <textarea
        ref={ref} readOnly value={text} rows={7} aria-label="Prompt to paste into Gemini"
        onFocus={(e) => e.currentTarget.select()}
        className="w-full resize-y rounded-xl border border-line bg-cream p-3 font-sans text-xs leading-relaxed text-ink-soft focus:border-cherry focus:outline-none"
      />
      <div className="mt-2 flex items-center gap-3">
        <button type="button" onClick={copy}
          className="rounded-lg bg-cherry px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-cherry/30 hover:bg-cherry-dark">
          {state === "copied" ? "Copied!" : "Copy prompt"}
        </button>
        {state === "selected" && <span role="status" className="text-xs text-honey">Selected: press Copy in the menu (or ⌘/Ctrl+C).</span>}
      </div>
    </div>
  );
}
