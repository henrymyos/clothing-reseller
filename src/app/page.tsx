"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { AnalyzeResponse, Comps } from "@/lib/schema";
import type { MySales } from "@/lib/sales";
import {
  AGES, COLORS, CONDITIONS, DEFAULT_FEES, DEPARTMENTS, MAX_COLORS, MAX_DESCRIPTION, MAX_HASHTAGS,
  MAX_STYLES, MEASUREMENT_FIELDS, MEASUREMENT_KINDS, SOURCES, STYLES,
  buildDescription, cleanHashtag, formatWeight, profit, shippedWeightOz,
  type Condition, type MeasurementKind,
} from "@/lib/depop";
import { Card, Label, input } from "@/components/ui";
import { inventoryToSales, nextSku, sheetRow, type InvItem } from "@/lib/inventory";
import { readInventory } from "@/lib/inventoryStore";
import { readSales, type SalesStore } from "@/lib/salesStore";
import { clearedMessage, whatWasCleared } from "@/lib/savedFlag";

type Status = "idle" | "loading" | "done" | "error";
const MAX_PHOTOS = 6;
const PHOTO_HINTS = ["Front", "Back", "Brand / size tag", "Care tag", "Flaw close-up", "Detail"];
// Everything the seller can edit after the analysis. The Depop description is
// rebuilt from these on every change, so the copied text always matches.
type Draft = {
  headline: string; sku: string; brand: string; size: string; condition: Condition; material: string;
  flaws: string[]; measurementKind: MeasurementKind; measurements: Record<string, string>; hashtags: string[];
  department: string; category: string; subcategory: string; colors: string[]; styles: string[];
  age: string; source: string; price: string; weightOz: string;
};

function draftFrom(r: AnalyzeResponse, sku: string): Draft {
  return {
    headline: r.headline, sku, brand: r.brand, size: r.size, condition: r.condition, material: r.material,
    flaws: r.visibleFlaws, measurementKind: r.measurementKind, measurements: {}, hashtags: r.hashtags,
    department: r.department, category: r.category, subcategory: r.subcategory, colors: r.colors, styles: r.styles,
    age: r.age, source: r.source, price: String(r.suggestedPrice), weightOz: String(Math.round(r.estimatedWeightOz)),
  };
}

export default function Home() {
  const [photos, setPhotos] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState(0); // remounts the results (and their profit inputs) per analysis
  const [sales, setSales] = useState<SalesStore | null>(null);
  const [inventory, setInventory] = useState<InvItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [cleared, setCleared] = useState<string | null>(null);

  // Her Depop sales and inventory sheet live only in this browser; they're loaded on My shop.
  // If the browser wiped them, say so — prices would otherwise quietly stop using her sales.
  useEffect(() => {
    const orders = readSales(), inv = readInventory();
    /* eslint-disable react-hooks/set-state-in-effect */
    setSales(orders); setInventory(inv?.items ?? []);
    /* eslint-enable react-hooks/set-state-in-effect */
    void whatWasCleared({ inventory: !!inv, sales: !!orders }).then((c) => setCleared(clearedMessage(c)));
  }, []);
  // Without a Depop sales export, the sold items in her inventory sheet price new listings.
  const pricingSales = sales?.sales ?? (inventory.length ? inventoryToSales(inventory) : undefined);
  async function addFiles(files: FileList) {
    const room = MAX_PHOTOS - photos.length;
    const picked = Array.from(files).slice(0, Math.max(0, room));
    const out: string[] = [];
    for (const f of picked) {
      try { out.push(await resizeImage(f, 900, 0.82)); } catch { /* skip unreadable files */ }
    }
    if (out.length) setPhotos((p) => [...p, ...out].slice(0, MAX_PHOTOS));
    if (files.length > room) setError(`Up to ${MAX_PHOTOS} photos — the extra ones were skipped.`);
  }

  async function analyze() {
    if (!photos.length) return;
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: photos, description: notes.trim() || undefined, sales: pricingSales }),
      });
      const text = await res.text();
      let data: AnalyzeResponse & { error?: string };
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(res.status === 413 ? "Those photos are too large together — try fewer or smaller photos." : text.slice(0, 160) || `Request failed (${res.status})`);
      }
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setResult(data);
      setDraft(draftFrom(data, nextSku(inventory)));
      setRunId((n) => n + 1);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setStatus("error");
    }
  }

  function startOver() {
    setPhotos([]); setNotes(""); setResult(null); setDraft(null); setStatus("idle"); setError(null);
  }

  return (
    <main className="min-h-screen bg-cream text-ink">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <header className="mb-5">
          <h1 className="font-display text-3xl font-semibold tracking-tight">List an item</h1>
          <p className="mt-1 text-sm text-ink-soft">Add photos — get the title, description, every Depop field and a price based on your own sales.</p>
          <p className="mt-1 text-xs text-muted">
            {pricingSales ? `Pricing from ${pricingSales.length} of your past sales.` : <>Load your sheet on <Link href="/shop" className="font-semibold text-cherry hover:underline">My shop</Link> so prices use your own sales.</>}
          </p>
          {cleared && (
            <div role="status" className="mt-3 rounded-2xl border border-honey/40 bg-honey-soft p-3 text-sm text-ink-soft">
              <p className="font-semibold text-honey">⚠️ Your saved data is gone</p>
              <p className="mt-0.5">{cleared}</p>
            </div>
          )}
        </header>

        {/* Photos + notes */}
        <Card>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((src, i) => (
              <div key={i} className="relative aspect-square overflow-hidden rounded-xl border border-line bg-cream">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`photo ${i + 1}`} className="h-full w-full object-cover" />
                {i === 0 && <span className="absolute left-1.5 top-1.5 rounded-md bg-ink/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">Cover</span>}
                <button
                  type="button"
                  onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                  className="absolute right-1.5 top-1.5 h-6 w-6 rounded-full bg-ink/75 text-sm leading-none text-white"
                  aria-label={`Remove photo ${i + 1}`}
                >×</button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex aspect-square flex-col items-center justify-center rounded-xl border-2 border-dashed border-line-strong bg-cream px-2 text-center text-muted transition hover:border-cherry/60 hover:bg-blush/40"
              >
                <span className="text-3xl">📷</span>
                <span className="mt-1 text-xs">{photos.length === 0 ? "Add photos" : `Add ${PHOTO_HINTS[photos.length] ?? "photo"}`}</span>
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">
            Up to {MAX_PHOTOS}: front, back, brand/size tag, care tag, and close-ups of any flaws. Tag photos are how size, brand and material get read.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }}
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Optional: anything the photos don't show — brand, size, era, fit, flaws."
            className="mt-3 w-full resize-none rounded-xl border border-line-strong bg-surface p-3 text-sm placeholder:text-muted/70 focus:border-cherry focus:outline-none focus:ring-2 focus:ring-cherry/15"
          />
          <div className="mt-3 flex gap-3">
            {result && (
              <button onClick={startOver} className="flex-1 rounded-xl border border-line-strong bg-surface py-3 font-medium transition hover:bg-blush">
                New item
              </button>
            )}
            <button
              onClick={analyze}
              disabled={!photos.length || status === "loading"}
              className="flex-1 rounded-xl bg-cherry py-3 font-semibold text-white shadow-sm shadow-cherry/30 transition hover:bg-cherry-dark disabled:opacity-40 disabled:shadow-none"
            >
              {status === "loading" ? "Analyzing…" : result ? "Re-analyze" : "Analyze"}
            </button>
          </div>
        </Card>

        {error && <div className="mt-4 rounded-xl border border-cherry/30 bg-blush p-4 text-sm text-cherry-dark">{error}</div>}

        {result && draft && status === "done" && <Results key={runId} result={result} draft={draft} setDraft={setDraft} />}
      </div>
    </main>
  );
}

function Results({ result, draft, setDraft }: { result: AnalyzeResponse; draft: Draft; setDraft: (d: Draft) => void }) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft({ ...draft, [k]: v });
  const description = useMemo(() => buildDescription(draft), [draft]);
  const [cost, setCost] = useState("");
  const [boosted, setBoosted] = useState(true); // she boosts most listings
  const [sheetName, setSheetName] = useState(`${result.brand && !/unbranded|unknown/i.test(result.brand) ? `${result.brand} ` : ""}${result.colors[0]?.toLowerCase() ?? ""} ${result.itemType.toLowerCase()}`.replace(/\s+/g, " ").trim());
  const [sellerPaysShipping, setSellerPaysShipping] = useState(false);
  const [shippingCost, setShippingCost] = useState("");
  const [fees, setFees] = useState(DEFAULT_FEES);
  const price = Number(draft.price) || 0;
  const money = profit({ price, cost: Number(cost) || 0, boosted, sellerPaysShipping, shippingCost: Number(shippingCost) || 0, fees });
  const shipOz = shippedWeightOz(Number(draft.weightOz) || 0);
  const fields = MEASUREMENT_FIELDS[draft.measurementKind];
  const sizeMissing = !draft.size.trim() || /not visible/i.test(draft.size);

  return (
    <div className="mt-6 space-y-4">
      {/* Anything SnapList had to work around — never applied silently. */}
      {!!result.notices?.length && <Notices items={result.notices} />}

      {/* Price */}
      <Card>
        <Label>Price</Label>
        <div className="mt-2 flex items-end gap-4">
          <div className="flex items-center font-display text-4xl font-semibold text-cherry">
            $<input
              type="number" inputMode="decimal" min={0} value={draft.price}
              onChange={(e) => set("price", e.target.value)}
              className="w-28 rounded-lg border border-transparent bg-transparent px-0.5 hover:border-line focus:border-cherry focus:outline-none"
              aria-label="Listing price"
            />
          </div>
          <p className="pb-1 text-sm text-muted">Suggested ${result.suggestedPrice} · range ${result.priceLow}–${result.priceHigh}</p>
        </div>
        <p className="mt-2 text-sm text-muted">{result.priceReasoning}</p>
        {result.mySales && result.mySales.matches.length >= 2 && (
          <p className="mt-2 mr-2 inline-block rounded-full bg-blush px-2.5 py-0.5 text-xs font-semibold text-cherry">
            ★ Based on {result.mySales.matches.length} of your own sales (median ${result.mySales.matchedMedian})
          </p>
        )}
        {result.priceBasis === "family" && result.mySales?.familyMedian != null && (
          <p className="mt-2 mr-2 inline-block rounded-full bg-blush px-2.5 py-0.5 text-xs font-semibold text-cherry">
            ★ Based on your typical ${result.mySales.familyMedian} for this kind of item ({result.mySales.familyCount} sales)
          </p>
        )}
        {result.comps ? (
          <p className="mt-2 inline-block rounded-full bg-sage-soft px-2.5 py-0.5 text-xs font-semibold text-sage">
            ✓ {result.priceBasis === "comps" ? "Based on" : "Checked against"} {result.comps.sampleSize} matching Depop listings (median ${result.comps.median})
          </p>
        ) : result.priceBasis === "mine" || result.priceBasis === "family" ? (
          <p className="mt-2 text-xs text-muted">No close Depop listings to compare against, so this comes from your own sales.</p>
        ) : (
          <p className="mt-2 text-xs text-muted">Estimate from the photos — nothing of yours or on Depop close enough to ground it. Check Depop before pricing.</p>
        )}
      </Card>

      {result.mySales && <MySalesCard mine={result.mySales} />}
      {result.comps && <CompsCard comps={result.comps} />}

      {/* Description */}
      <Card>
        <div className="flex items-center justify-between gap-3">
          <Label>Depop description</Label>
          <CopyButton text={description} label="Copy description" primary />
        </div>
        <Field label="First line (shows as the title)">
          <textarea value={draft.headline} onChange={(e) => set("headline", e.target.value.replace(/\n/g, " "))} rows={2} className={`${input} resize-none`} />
        </Field>
        <p className="mt-1 text-xs text-muted">Written like your listings, with extra words buyers search for. Brand, condition and material go in Depop&apos;s own fields below.</p>
        <Field label="SKU">
          <input value={draft.sku} onChange={(e) => set("sku", e.target.value)} placeholder="e.g. 0190" className={input} />
        </Field>
        <Field label={`Hashtags (up to ${MAX_HASHTAGS}, comma-separated)`}>
          <input
            value={draft.hashtags.join(", ")}
            onChange={(e) => set("hashtags", e.target.value.split(/[,\s]+/).map(cleanHashtag).filter(Boolean).slice(0, MAX_HASHTAGS))}
            className={input}
          />
        </Field>
        <p className="mt-3 text-xs font-medium text-muted">Preview</p>
        <pre className="mt-1 whitespace-pre-wrap rounded-xl bg-cream p-3 font-sans text-sm text-ink-soft">{description}</pre>
        <p className={`mt-1 text-right text-xs ${description.length > MAX_DESCRIPTION ? "text-cherry" : "text-muted"}`}>
          {description.length}/{MAX_DESCRIPTION}{description.length > MAX_DESCRIPTION ? " — too long for Depop, shorten the first line" : ""}
        </p>
      </Card>

      {/* Measurements */}
      <Card>
        <div className="flex items-center justify-between gap-3">
          <Label>Measurements</Label>
          <select value={draft.measurementKind} onChange={(e) => set("measurementKind", e.target.value as MeasurementKind)} className="rounded-lg border border-line-strong bg-surface px-2 py-1 text-sm">
            {MEASUREMENT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <p className="mt-1 text-xs text-muted">Lay it flat and measure in inches. These go straight into the description — buyers ask for them more than anything else.</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {fields.map((f) => (
            <label key={f.key} className="text-sm">
              <span className="font-medium">{f.label}</span>
              {f.hint && <span className="block text-xs text-muted">{f.hint}</span>}
              <input
                inputMode="decimal" placeholder='e.g. 22' value={draft.measurements[f.key] ?? ""}
                onChange={(e) => set("measurements", { ...draft.measurements, [f.key]: e.target.value })}
                className={`${input} mt-1`}
              />
            </label>
          ))}
        </div>
      </Card>

      {/* Condition + flaws */}
      <Card>
        <Label>Condition & flaws</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {CONDITIONS.map((c) => (
            <button key={c} type="button" onClick={() => set("condition", c)}
              className={`rounded-full border px-3 py-1 text-sm ${draft.condition === c ? "border-cherry bg-cherry text-white" : "border-line-strong bg-surface"}`}>{c}</button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          {result.visibleFlaws.length ? "Flaws spotted in your photos — edit or add any it missed. Listing them up front prevents returns." : "No flaws spotted in the photos. Add any you know about."}
        </p>
        <div className="mt-2 space-y-2">
          {draft.flaws.map((f, i) => (
            <div key={i} className="flex gap-2">
              <input value={f} onChange={(e) => set("flaws", draft.flaws.map((x, j) => (j === i ? e.target.value : x)))} className={input} />
              <button type="button" onClick={() => set("flaws", draft.flaws.filter((_, j) => j !== i))} className="rounded-lg border border-line-strong px-3 text-sm" aria-label="Remove flaw">×</button>
            </div>
          ))}
          <button type="button" onClick={() => set("flaws", [...draft.flaws, ""])} className="text-sm font-medium text-ink-soft hover:text-cherry">+ Add a flaw</button>
        </div>
      </Card>

      {/* Depop form fields */}
      <Card>
        <Label>Depop listing details</Label>
        <p className="mt-1 text-xs text-muted">Fill these into Depop&apos;s Sell form. Tap copy on any text field.</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <SelectField label="Department" value={draft.department} options={DEPARTMENTS} onChange={(v) => set("department", v)} />
          <TextField label="Category" value={draft.category} onChange={(v) => set("category", v)} />
          <TextField label="Subcategory" value={draft.subcategory} onChange={(v) => set("subcategory", v)} />
          <TextField label="Brand" value={draft.brand} onChange={(v) => set("brand", v)} />
          <TextField
            label="Size" value={draft.size} onChange={(v) => set("size", v)}
            warn={sizeMissing ? "Size not visible — add it from the tag" : result.sizeSource === "tag" && draft.size === result.size ? `Read “${result.sizeTagText || result.size}” off the tag — confirm before posting` : undefined}
          />
          <TextField label="Material" value={draft.material} onChange={(v) => set("material", v)} />
          <SelectField label="Age" value={draft.age} options={AGES} onChange={(v) => set("age", v)} />
          <SelectField label="Source" value={draft.source} options={SOURCES} onChange={(v) => set("source", v)} />
        </div>
        <Chips label={`Colour (up to ${MAX_COLORS})`} options={COLORS} value={draft.colors} max={MAX_COLORS} onChange={(v) => set("colors", v)} />
        <Chips label={`Style (up to ${MAX_STYLES})`} options={STYLES} value={draft.styles} max={MAX_STYLES} onChange={(v) => set("styles", v)} />
      </Card>

      {/* Shipping + profit */}
      <Card>
        <Label>Shipping & profit</Label>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <label>
            <span className="font-medium">Item weight (oz)</span>
            <input inputMode="decimal" value={draft.weightOz} onChange={(e) => set("weightOz", e.target.value)} className={`${input} mt-1`} />
          </label>
          <div>
            <span className="font-medium">Packed weight</span>
            <p className="mt-2 text-lg font-semibold">{formatWeight(shipOz)}</p>
            <p className="text-xs text-muted">Pick the smallest Depop package size that covers this.</p>
          </div>
          <label>
            <span className="font-medium">What you paid ($)</span>
            <input inputMode="decimal" placeholder="0" value={cost} onChange={(e) => setCost(e.target.value)} className={`${input} mt-1`} />
          </label>
          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-2"><input type="checkbox" checked={boosted} onChange={(e) => setBoosted(e.target.checked)} /> Boosted listing</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={sellerPaysShipping} onChange={(e) => setSellerPaysShipping(e.target.checked)} /> I pay shipping</label>
            {sellerPaysShipping && (
              <input inputMode="decimal" placeholder="Label cost $" value={shippingCost} onChange={(e) => setShippingCost(e.target.value)} className={input} />
            )}
          </div>
        </div>
        <dl className="mt-4 space-y-1 rounded-xl bg-cream p-3 text-sm">
          <Row k="Sale price" v={price} />
          <Row k={`Payment processing (${fees.processingPct}% + $${fees.processingFixed})`} v={-money.processing} />
          {boosted && <Row k={`Boost fee (${fees.boostPct}%)`} v={-money.boost} />}
          {sellerPaysShipping && <Row k="Shipping label" v={-money.shipping} />}
          <Row k="You receive" v={money.payout} bold />
          <Row k="Profit after what you paid" v={money.net} bold color={money.net >= 0 ? "text-sage" : "text-cherry"} />
        </dl>
        <details className="mt-2 text-xs text-muted">
          <summary className="cursor-pointer">Fee rates (Depop US defaults — edit if they&apos;ve changed)</summary>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <FeeInput label="Processing %" value={fees.processingPct} onChange={(v) => setFees({ ...fees, processingPct: v })} />
            <FeeInput label="Processing $" value={fees.processingFixed} onChange={(v) => setFees({ ...fees, processingFixed: v })} />
            <FeeInput label="Boost %" value={fees.boostPct} onChange={(v) => setFees({ ...fees, boostPct: v })} />
            <FeeInput label="Buyer shipping $" value={fees.buyerShipping} onChange={(v) => setFees({ ...fees, buyerShipping: v })} />
            <FeeInput label="Sales tax %" value={fees.salesTaxPct} onChange={(v) => setFees({ ...fees, salesTaxPct: v })} />
          </div>
          <p className="mt-1">Processing is charged on everything the buyer pays — item, shipping and tax.</p>
        </details>
        <div className="mt-4 rounded-xl border border-line p-3 text-sm">
          <p className="font-medium">Add to your inventory sheet</p>
          <p className="mt-0.5 text-xs text-muted">Copies a row{draft.sku ? ` (SKU ${draft.sku})` : ""} — click the first empty cell in the SOLD? column of your sheet and paste.</p>
          <div className="mt-2 flex gap-2">
            <input value={sheetName} onChange={(e) => setSheetName(e.target.value)} className={input} aria-label="Name for your sheet" />
            <CopyButton primary label="Copy row" text={sheetRow({ sku: draft.sku, name: sheetName, cost, listPrice: draft.price, date: new Date() })} />
          </div>
        </div>
      </Card>

      <p className="text-center text-xs text-muted">
        Confidence: {result.confidence} · read from {result.photoCount} photo{result.photoCount === 1 ? "" : "s"} · prices are estimates.
      </p>
    </div>
  );
}

// A clear heads-up when something didn't work the usual way.
function Notices({ items }: { items: string[] }) {
  return (
    <div role="status" className="rounded-2xl border border-honey/40 bg-honey-soft p-4 text-sm">
      <p className="font-semibold text-honey">⚠️ Heads up</p>
      <ul className={`mt-1 space-y-1 text-ink-soft ${items.length > 1 ? "list-disc pl-5" : ""}`}>
        {items.map((n) => <li key={n}>{n}</li>)}
      </ul>
    </div>
  );
}

function MySalesCard({ mine }: { mine: MySales }) {
  return (
    <div className="rounded-2xl border border-cherry/25 bg-blush p-5 card-shadow">
      <p className="text-xs font-semibold uppercase tracking-wide text-cherry">Your past sales</p>
      {mine.matches.length ? (
        <>
          <p className="mt-1 text-sm text-ink-soft">You&apos;ve sold {mine.matches.length} like this{mine.matchedMedian != null ? ` — usually for $${mine.matchedMedian}` : ""}.</p>
          <ul className="mt-3 space-y-1.5">
            {mine.matches.slice(0, 6).map((s, i) => (
              <li key={i} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate">{s.title}</p>
                  <p className="text-xs text-muted">{[s.brand, s.size && `size ${s.size}`, s.date].filter(Boolean).join(" · ")}</p>
                </div>
                <span className="shrink-0 font-semibold">${s.price}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-1 text-sm text-ink-soft">No close matches in your sales yet.</p>
      )}
      {mine.familyMedian != null && (
        <p className="mt-3 text-xs text-muted">Across {mine.familyCount} sales of this kind of item, your typical price is ${mine.familyMedian}.</p>
      )}
    </div>
  );
}

function CompsCard({ comps }: { comps: Comps }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? comps.listings : comps.listings.slice(0, 5);
  return (
    <Card>
      <Label>Matching Depop listings</Label>
      <div className="mt-2 flex items-baseline gap-6">
        <div><p className="text-2xl font-bold">${comps.low}–${comps.high}</p><p className="text-xs text-muted">Range</p></div>
        <div><p className="text-2xl font-bold">${comps.median}</p><p className="text-xs text-muted">Median of {comps.sampleSize}</p></div>
      </div>
      <ul className="mt-3 space-y-2">
        {visible.map((l) => (
          <li key={l.url} className="flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0">
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="block truncate text-ink hover:text-cherry hover:underline">{l.title}</a>
              <p className="truncate text-xs text-muted">{l.similarity}% match · {l.brand}{l.size ? ` · size ${l.size}` : ""} · {l.reason}</p>
            </div>
            <span className="shrink-0 font-medium">${l.price}</span>
          </li>
        ))}
      </ul>
      {comps.listings.length > 5 && (
        <button onClick={() => setShowAll((s) => !s)} className="mt-3 w-full rounded-lg border border-line py-2 text-sm font-medium text-ink-soft hover:bg-blush">
          {showAll ? "Show fewer" : `See all ${comps.listings.length}`}
        </button>
      )}
      <p className="mt-3 text-xs text-muted">
        Live asking prices{comps.excluded ? ` · ${comps.excluded} other result${comps.excluded === 1 ? "" : "s"} left out as not comparable` : ""}. Items usually sell a little under these, so the suggestion sits below the median.
      </p>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="mt-3 block text-sm"><span className="font-medium">{label}</span><div className="mt-1">{children}</div></label>;
}
function TextField({ label, value, onChange, warn }: { label: string; value: string; onChange: (v: string) => void; warn?: string }) {
  return (
    <label className="text-sm">
      <span className="flex items-center justify-between font-medium">{label}<CopyButton text={value} label="Copy" /></span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className={`${input} mt-1 ${warn ? "border-honey" : ""}`} />
      {warn && <span className="mt-1 block text-xs text-honey">{warn}</span>}
    </label>
  );
}
function SelectField({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (v: string) => void }) {
  return (
    <label className="text-sm">
      <span className="font-medium">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`${input} mt-1`}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
function Chips({ label, options, value, max, onChange }: { label: string; options: readonly string[]; value: string[]; max: number; onChange: (v: string[]) => void }) {
  return (
    <div className="mt-4">
      <p className="text-sm font-medium">{label}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value.includes(o);
          const full = !on && value.length >= max;
          return (
            <button key={o} type="button" disabled={full}
              onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${on ? "border-cherry bg-cherry text-white" : "border-line-strong bg-surface"} ${full ? "opacity-40" : ""}`}>
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}
function CopyButton({ text, label, primary }: { text: string; label: string; primary?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button"
      onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1400); } catch { /* clipboard blocked */ } }}
      className={primary
        ? "shrink-0 rounded-lg bg-cherry px-3 py-1.5 text-sm font-semibold text-white shadow-sm shadow-cherry/30 hover:bg-cherry-dark"
        : "shrink-0 rounded px-1.5 text-xs font-normal text-muted hover:text-cherry"}>
      {done ? "Copied!" : label}
    </button>
  );
}
function Row({ k, v, bold, color }: { k: string; v: number; bold?: boolean; color?: string }) {
  return (
    <div className={`flex justify-between ${bold ? "border-t border-line pt-1 font-semibold" : "text-ink-soft"} ${color ?? ""}`}>
      <dt>{k}</dt><dd>{v < 0 ? `−$${Math.abs(v).toFixed(2)}` : `$${v.toFixed(2)}`}</dd>
    </div>
  );
}
function FeeInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label>
      {label}
      <input inputMode="decimal" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} className={`${input} mt-1`} />
    </label>
  );
}

// Resize a picked image to fit within maxDim and re-encode as JPEG to keep the upload small.
function resizeImage(file: File, maxDim: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const scale = Math.min(1, maxDim / Math.max(width, height));
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas unavailable"));
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not load image")); };
    img.src = url;
  });
}
