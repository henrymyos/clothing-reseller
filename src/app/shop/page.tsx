"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { analyzeInventory, importInventory, reportCsv, type ItemCalc, type Report } from "@/lib/inventory";
import { importSalesCsv, type Sale } from "@/lib/sales";
import { readSales, saveSales, type SalesStore } from "@/lib/salesStore";
import { normSize, recommend, type Rec } from "@/lib/recommend";
import { DEFAULT_FEES } from "@/lib/depop";
import { readInventory, readShopSettings, saveInventory, saveShopSettings, type InventoryStore, type ShopSettings } from "@/lib/inventoryStore";
import { Card, Label, input } from "@/components/ui";

const usd = (n: number | null | undefined, digits = 2) =>
  n == null ? "—" : `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(digits)}`;
const pct = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n * 100)}%`);
const monthName = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleString("en-US", { month: "short", year: "numeric" });
const shortDate = (d: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");
const inline = input.replace("w-full ", "w-auto ");
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export default function Shop() {
  const [store, setStore] = useState<InventoryStore | null>(null);
  const [settings, setSettings] = useState<ShopSettings>({ assumeBoosted: true, staleDays: 30 });
  const [sales, setSales] = useState<SalesStore | null>(null);
  const [loaded, setLoaded] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setStore(readInventory()); setSales(readSales()); setSettings(readShopSettings()); setLoaded(true); }, []);

  function save(v: InventoryStore | null) { setStore(v); saveInventory(v); }
  function saveOrders(v: SalesStore | null) { setSales(v); saveSales(v); }
  function updateSettings(v: ShopSettings) { setSettings(v); saveShopSettings(v); }

  const report = useMemo(
    () => (store ? analyzeInventory(store.items, todayIso(), { fees: DEFAULT_FEES, ...settings }) : null),
    [store, settings],
  );
  const recs = useMemo(
    () => (report ? recommend(report, sales?.sales ?? [], todayIso(), { fees: DEFAULT_FEES, ...settings }) : []),
    [report, sales, settings],
  );

  return (
    <main className="min-h-screen bg-cream text-ink">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <header className="mb-5">
          <h1 className="font-display text-3xl font-semibold tracking-tight">My shop</h1>
          <p className="mt-1 text-sm text-ink-soft">Everything about your past orders, and what to do next.</p>
          {(report || sales) && (
            <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
              {[report && ["next", "What to do next"], report && ["orders", "Past orders"], sales && ["depop", "Depop orders"], report && ["stock", "Stock"], ["data", "Your data"]]
                .filter((x): x is string[] => !!x)
                .map(([id, label]) => <a key={id} href={`#${id}`} className="rounded-full border border-line-strong bg-surface px-2.5 py-1 font-medium text-ink-soft hover:border-cherry/50 hover:text-cherry">{label}</a>)}
            </div>
          )}
        </header>

        {loaded && !store && !sales && (
          <div className="mb-5 rounded-2xl border border-cherry/25 bg-blush p-5 text-sm text-ink-soft">
            <p className="font-semibold text-ink">Start here</p>
            <p className="mt-1">Load your inventory sheet (for profit and buying advice) and your Depop sales export (for sizes and brands). Both stay on this device.</p>
          </div>
        )}

        {report && store && (
          <div className="space-y-5">
            <Section id="next" title="What to do next" sub="Recommendations for your next buying trips and listings, from your own numbers.">
              <Recs recs={recs} />
            </Section>
            <Section id="orders" title="Past orders" sub={`${report.totals.sold} sold items from your inventory sheet.`}>
            <Summary r={report} />
            {report.issues.length > 0 && (
              <div className="rounded-2xl border border-honey/40 bg-honey-soft p-4 text-sm">
                <p className="font-semibold text-honey">Check your sheet</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-soft">{report.issues.map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
            )}
            <FeesCard r={report} />
            <Months r={report} />
            <Groups r={report} />
            <Hauls r={report} />
            <BestWorst r={report} />
            </Section>
          </div>
        )}

        {sales && (
          <div className="mt-5">
            <Section id="depop" title="Depop orders" sub={`${sales.sales.length} sales from your Depop export, with sizes and brands.`}>
              <DepopOrders sales={sales.sales} />
            </Section>
          </div>
        )}

        {report && store && (
          <div className="mt-5 space-y-5">
            <Section id="stock" title="Stock" sub={`${report.totals.unsold} items not sold yet.`}>
            <StaleCard r={report} staleDays={settings.staleDays} />
            <AllItems items={report.items} />
            </Section>
            <Card>
              <Label>Settings</Label>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <label>
                  <span className="font-medium">Call stock stale after (days)</span>
                  <input inputMode="numeric" value={settings.staleDays} onChange={(e) => updateSettings({ ...settings, staleDays: Math.max(1, Number(e.target.value) || 30) })} className={`${input} mt-1`} />
                </label>
                <label className="flex items-center gap-2 pt-6">
                  <input type="checkbox" checked={settings.assumeBoosted} onChange={(e) => updateSettings({ ...settings, assumeBoosted: e.target.checked })} />
                  Estimates assume boosted listings
                </label>
              </div>
              <p className="mt-2 text-xs text-muted">
                Estimates use Depop US fees: {DEFAULT_FEES.processingPct}% + ${DEFAULT_FEES.processingFixed} payment processing on what the buyer pays, plus {DEFAULT_FEES.boostPct}% when a boosted listing sells. Sold items with a payout in your sheet use the real number.
              </p>
              <button type="button" onClick={() => downloadCsv(report)} className="mt-3 rounded-lg border border-line-strong px-3 py-2 text-xs font-semibold hover:bg-blush">
                Download the full breakdown (CSV)
              </button>
            </Card>
          </div>
        )}

        <div className="mt-5">
          <Section id="data" title="Your data" sub="Stored on this device only. Update whenever your sheet or Depop sales change.">
            <ImportCard store={store} onChange={save} />
            <OrdersImport store={sales} onChange={saveOrders} />
          </Section>
        </div>
      </div>
    </main>
  );
}

function Section({ id, title, sub, children }: { id: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-4">
      <div className="pt-2">
        <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
        {sub && <p className="text-sm text-muted">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

const REC_ICON: Record<Rec["kind"], string> = { buy: "🛍️", skip: "✋", pay: "💵", size: "📏", brand: "🏷️", price: "🤝", boost: "🚀", stock: "📦", markdown: "✂️" };
function Recs({ recs }: { recs: Rec[] }) {
  if (!recs.length) return <Card><p className="text-sm text-muted">Not enough sales yet for recommendations.</p></Card>;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {recs.map((r) => (
        <div key={r.title} className={`rounded-2xl border p-4 card-shadow ${r.kind === "buy" ? "border-sage/30 bg-sage-soft" : r.kind === "skip" ? "border-honey/30 bg-honey-soft" : "border-line bg-surface"}`}>
          <p className="font-semibold"><span aria-hidden className="mr-1.5">{REC_ICON[r.kind]}</span>{r.title}</p>
          <p className="mt-1 text-sm text-ink-soft">{r.detail}</p>
        </div>
      ))}
    </div>
  );
}

function DepopOrders({ sales }: { sales: Sale[] }) {
  const [limit, setLimit] = useState(15);
  const sorted = useMemo(() => [...sales].sort((a, b) => b.date.localeCompare(a.date)), [sales]);
  const prices = sales.map((x) => x.price).sort((a, b) => a - b);
  const mid = prices[Math.floor(prices.length / 2)] ?? 0;
  const total = prices.reduce((a, b) => a + b, 0);
  const sizes = new Map<string, number>();
  for (const x of sales) { const z = normSize(x.size); if (z) sizes.set(z, (sizes.get(z) ?? 0) + 1); }
  const sizeList = [...sizes].sort((a, b) => b[1] - a[1]);
  const brands = new Map<string, number[]>();
  for (const x of sales) if (x.brand && !/^(other)$/i.test(x.brand)) brands.set(x.brand, [...(brands.get(x.brand) ?? []), x.price]);
  const brandList = [...brands].sort((a, b) => b[1].length - a[1].length).slice(0, 10);
  const range = sorted.length ? `${shortDate(sorted[sorted.length - 1].date)} – ${shortDate(sorted[0].date)}` : "";
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Tile label="Orders" value={`${sales.length}`} sub={range} />
        <Tile label="Typical price" value={usd(mid, 0)} sub="median sale" />
        <Tile label="Total sales" value={usd(total, 0)} sub="before fees" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Card>
          <Label>Sizes sold</Label>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {sizeList.map(([k, n]) => <span key={k} className="rounded-full border border-line-strong bg-cream px-2.5 py-0.5 text-xs"><b>{k}</b> · {n}</span>)}
          </div>
        </Card>
        <Card>
          <Label>Top brands</Label>
          <ul className="mt-2 space-y-1 text-sm">
            {brandList.map(([b, p]) => <li key={b} className="flex justify-between gap-3"><span className="truncate">{b}</span><span className="shrink-0 text-muted">{p.length} sold · ~{usd([...p].sort((x, y) => x - y)[Math.floor(p.length / 2)], 0)}</span></li>)}
          </ul>
        </Card>
      </div>
      <Card>
        <Label>Recent orders</Label>
        <ul className="mt-2 divide-y divide-line">
          {sorted.slice(0, limit).map((x, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <div className="min-w-0">
                <p className="truncate">{x.title}</p>
                <p className="text-xs text-muted">{[shortDate(x.date), x.brand, x.size && `size ${x.size}`].filter(Boolean).join(" · ")}</p>
              </div>
              <span className="shrink-0 font-semibold">{usd(x.price)}</span>
            </li>
          ))}
        </ul>
        {sorted.length > limit && <button onClick={() => setLimit((n) => n + 50)} className="mt-2 w-full rounded-lg border border-line py-2 text-sm font-medium text-ink-soft hover:bg-blush">Show more ({sorted.length - limit} left)</button>}
      </Card>
    </>
  );
}

// Her Depop sales export (sizes, brands, full titles). Also prices new listings.
function OrdersImport({ store, onChange }: { store: SalesStore | null; onChange: (v: SalesStore | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  async function onFile(f: File) {
    const r = importSalesCsv(await f.text());
    if ("error" in r) { setMsg({ text: r.error, bad: true }); return; }
    onChange({ sales: r.sales, fileName: f.name, importedAt: Date.now() });
    setMsg({ text: `Loaded ${r.sales.length} orders${r.skipped ? ` (${r.skipped} rows without a price skipped)` : ""}.` });
  }
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 card-shadow">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Depop sales export</p>
          <p className="truncate text-xs text-muted">{store ? `${store.sales.length} orders · ${store.fileName}` : "A CSV of your Depop sales — sizes, brands and full titles. Also used to price new listings."}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {store && <button type="button" onClick={() => { onChange(null); setMsg({ text: "Depop orders removed from this device." }); }} className="rounded-lg px-2 py-1.5 text-xs text-muted hover:text-cherry">Remove</button>}
          <button type="button" onClick={() => ref.current?.click()} className="rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold hover:bg-blush">{store ? "Update" : "Import"}</button>
        </div>
      </div>
      {msg && <p className={`mt-2 text-xs ${msg.bad ? "text-cherry" : "text-sage"}`}>{msg.text}</p>}
      <input ref={ref} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
    </div>
  );
}

function downloadCsv(r: Report) {
  const url = URL.createObjectURL(new Blob([reportCsv(r)], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `snaplist-profit-${todayIso()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- import ----------

function ImportCard({ store, onChange }: { store: InventoryStore | null; onChange: (v: InventoryStore | null) => void }) {
  const [open, setOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function take(text: string, source: string, sheetUrl?: string) {
    const r = importInventory(text);
    if ("error" in r) { setMsg({ text: r.error, bad: true }); return; }
    onChange({ items: r.items, source, sheetUrl, importedAt: Date.now() });
    setMsg({ text: `Loaded ${r.items.length} items${r.skipped ? ` (${r.skipped} empty rows skipped)` : ""}.` });
    setOpen(false); setPaste("");
  }
  async function fromLink(url: string) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/sheet?url=${encodeURIComponent(url)}`);
      const text = await res.text();
      if (!res.ok) { let e = "Couldn't read that sheet."; try { e = JSON.parse(text).error ?? e; } catch { /* not JSON */ } setMsg({ text: e, bad: true }); return; }
      take(text, "Google Sheet", url);
    } catch { setMsg({ text: "Couldn't reach the sheet — check your connection.", bad: true }); }
    finally { setBusy(false); }
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-4 card-shadow">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Your inventory sheet</p>
          <p className="truncate text-xs text-muted">
            {store ? `${store.items.length} items · ${store.source} · updated ${new Date(store.importedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "Paste or link the sheet where you track cost, listing and sale prices."}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {store?.sheetUrl && (
            <button type="button" disabled={busy} onClick={() => void fromLink(store.sheetUrl!)} className="rounded-lg bg-cherry px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-cherry/30 hover:bg-cherry-dark disabled:opacity-50">
              {busy ? "Refreshing…" : "Refresh"}
            </button>
          )}
          <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold hover:bg-blush">{store ? "Update" : "Import"}</button>
        </div>
      </div>
      {open && (
        <div className="mt-3 space-y-4 rounded-xl bg-cream p-3 text-xs text-ink-soft">
          <div>
            <p className="font-semibold text-ink">Paste from Google Sheets</p>
            <p className="mt-0.5">In the sheet, click the corner box to select everything, copy (⌘C), and paste here.</p>
            <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={3} placeholder="SOLD?  SKU  NAME  COST  …" className={`${input} mt-1.5 font-mono text-xs`} />
            <button type="button" disabled={!paste.trim()} onClick={() => take(paste, "pasted sheet")} className="mt-1.5 rounded-lg bg-cherry px-3 py-2 text-xs font-semibold text-white hover:bg-cherry-dark disabled:opacity-40">Use pasted sheet</button>
          </div>
          <div>
            <p className="font-semibold text-ink">Or link it (refreshes with one tap)</p>
            <p className="mt-0.5">The sheet must be shared as “Anyone with the link — Viewer”. Anyone with the link could then see your costs.</p>
            <div className="mt-1.5 flex gap-2">
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" className={input} />
              <button type="button" disabled={!link.trim() || busy} onClick={() => void fromLink(link)} className="shrink-0 rounded-lg bg-cherry px-3 py-2 text-xs font-semibold text-white hover:bg-cherry-dark disabled:opacity-40">{busy ? "Loading…" : "Load"}</button>
            </div>
          </div>
          <div>
            <p className="font-semibold text-ink">Or a CSV file</p>
            <button type="button" onClick={() => fileRef.current?.click()} className="mt-1.5 rounded-lg border border-line-strong bg-surface px-3 py-2 text-xs font-semibold hover:bg-blush">Choose CSV file</button>
          </div>
          <p className="text-muted">
            Needs at least an item name and a cost column; sold?, SKU, purchase/listing/selling dates, listing/selling price and revenue (payout) are used when present.
            Stored on this device only.
            {store && <> · <button type="button" onClick={() => { onChange(null); setMsg({ text: "Inventory removed from this device." }); }} className="underline hover:text-cherry">Remove it</button></>}
          </p>
        </div>
      )}
      {msg && <p className={`mt-2 text-xs ${msg.bad ? "text-cherry" : "text-sage"}`}>{msg.text}</p>}
      <input ref={fileRef} type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" className="hidden"
        onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) take(await f.text(), f.name); }} />
    </div>
  );
}

// ---------- report sections ----------

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-0.5 text-xl font-bold ${tone === "good" ? "text-sage" : tone === "bad" ? "text-cherry" : ""}`}>{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

function Summary({ r }: { r: Report }) {
  const t = r.totals;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Tile label="Profit" value={usd(t.profit, 0)} tone={t.profit >= 0 ? "good" : "bad"} sub={`after fees + what you paid`} />
      <Tile label="Depop paid you" value={usd(t.payout, 0)} sub={`${usd(t.grossSales, 0)} in sales`} />
      <Tile label="Sold" value={`${t.sold} of ${t.items}`} sub={`${pct(t.sellThrough)} sell-through`} />
      <Tile label="Per item" value={usd(t.avgProfit)} sub={`median ${usd(t.medianProfit)} · ${pct(t.avgRoi)} return on cost`} />
      <Tile label="Days to sell" value={t.medianDaysToSell == null ? "—" : `${t.medianDaysToSell}`} sub={`median · ${pct(t.soldWithin7)} sell within a week`} />
      <Tile label="Cash back" value={usd(t.cashBack, 0)} tone={t.cashBack >= 0 ? "good" : "bad"} sub={`payouts − ${usd(t.totalSpent, 0)} spent on stock`} />
      <Tile label="Unsold stock" value={`${t.unsold}`} sub={`${usd(t.unsoldCost, 0)} paid · ~${usd(t.unsoldPotential, 0)} if it sells at list`} />
      <Tile label="Offers" value={pct(t.offerShare)} sub={`sold under list · avg ${usd(t.avgOfferOff)} off`} />
    </div>
  );
}

function FeesCard({ r }: { r: Report }) {
  const t = r.totals;
  return (
    <Card>
      <Label>Fees</Label>
      <p className="mt-2 text-sm text-ink-soft">
        Depop kept <b className="text-ink">{usd(t.fees)}</b> of {usd(t.grossSales)} in sales ({pct(t.grossSales ? t.fees / t.grossSales : 0)}).
        {t.boostedShare != null && t.boostFees != null && (
          <> About <b className="text-ink">{pct(t.boostedShare)}</b> of your sales were boosted, which cost roughly <b className="text-ink">{usd(t.boostFees)}</b> ({DEFAULT_FEES.boostPct}% each) — your biggest fee. Worth testing: list a few items without boosting and see whether they sell as fast.</>
        )}
      </p>
    </Card>
  );
}

function StaleCard({ r, staleDays }: { r: Report; staleDays: number }) {
  const [all, setAll] = useState(false);
  if (!r.stale.length) return null;
  const shown = all ? r.stale : r.stale.slice(0, 6);
  return (
    <Card>
      <Label>Not moving — listed {staleDays}+ days</Label>
      <p className="mt-1 text-xs text-muted">{r.stale.length} item{r.stale.length === 1 ? "" : "s"}, {usd(r.stale.reduce((s, x) => s + x.item.cost, 0))} of stock. Suggested prices never go below what covers the item&apos;s cost after fees.</p>
      <ul className="mt-3 divide-y divide-line">
        {shown.map(({ item, price, reason }) => (
          <li key={item.sku + item.name} className="flex items-center justify-between gap-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="truncate">{item.sku && <span className="text-muted">{item.sku} · </span>}{item.name}</p>
              <p className="text-xs text-muted">{reason}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-semibold">{price < item.listPrice! ? <><span className="mr-1 text-xs font-normal text-muted line-through">{usd(item.listPrice, 0)}</span>{usd(price, 0)}</> : usd(price, 0)}</p>
              <p className="text-xs text-muted">break-even {usd(item.breakEven)}</p>
            </div>
          </li>
        ))}
      </ul>
      {r.stale.length > 6 && <button onClick={() => setAll((a) => !a)} className="mt-2 w-full rounded-lg border border-line py-2 text-sm font-medium text-ink-soft hover:bg-blush">{all ? "Show fewer" : `See all ${r.stale.length}`}</button>}
    </Card>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="-mx-1 mt-3 overflow-x-auto">
      <table className="w-full min-w-[480px] text-sm">
        <thead><tr className="text-left text-xs text-muted">{head.map((h, i) => <th key={h} className={`px-1 pb-1 font-medium ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">
          {rows.map((row, i) => <tr key={i}>{row.map((c, j) => <td key={j} className={`px-1 py-1.5 ${j ? "text-right tabular-nums" : ""}`}>{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

function Months({ r }: { r: Report }) {
  return (
    <Card>
      <Label>By month</Label>
      <Table head={["Month", "Sold", "Sales", "Profit", "Spent on stock"]}
        rows={r.months.map((m) => [monthName(m.month), m.sold, usd(m.sales, 0), usd(m.profit, 0), usd(m.spent, 0)])} />
    </Card>
  );
}

function Groups({ r }: { r: Report }) {
  const best = [...r.groups].filter((g) => g.sold >= 3).sort((a, b) => (b.avgProfit ?? 0) - (a.avgProfit ?? 0))[0];
  const fastest = [...r.groups].filter((g) => g.sold >= 3 && g.medianDays != null).sort((a, b) => a.medianDays! - b.medianDays!)[0];
  return (
    <Card>
      <Label>What sells</Label>
      {best && fastest && (
        <p className="mt-2 text-sm text-ink-soft">
          <b className="text-ink">{fastest.key}</b> sell fastest (median {fastest.medianDays} day{fastest.medianDays === 1 ? "" : "s"}, {pct(fastest.sellThrough)} sold);
          {" "}<b className="text-ink">{best.key}</b> make the most per item ({usd(best.avgProfit)}).
        </p>
      )}
      <Table head={["Kind", "Sold", "Unsold", "Sell-through", "Avg sale", "Avg profit", "Days to sell"]}
        rows={r.groups.map((g) => [g.key, g.sold, g.unsold, pct(g.sellThrough), usd(g.avgSale), usd(g.avgProfit), g.medianDays ?? "—"])} />
    </Card>
  );
}

function Hauls({ r }: { r: Report }) {
  return (
    <Card>
      <Label>Sourcing trips</Label>
      <p className="mt-1 text-xs text-muted">Everything bought on the same day, and whether it has paid for itself yet.</p>
      <Table head={["Bought", "Items", "Sold", "Spent", "Paid out", "Profit so far", ""]}
        rows={r.hauls.map((h) => [shortDate(h.date), h.sold + h.unsold, h.sold, usd(h.spent, 0), usd(h.returned, 0), usd(h.totalProfit, 0), h.paidBack ? "✓ paid back" : `${usd(h.spent - h.returned, 0)} to go`])} />
    </Card>
  );
}

function ItemLine({ i, right }: { i: ItemCalc; right: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <div className="min-w-0">
        <p className="truncate">{i.name}</p>
        <p className="text-xs text-muted">
          {[i.sku, `paid ${usd(i.cost)}`, i.sold ? `sold ${usd(i.soldPrice)}${i.daysToSell != null ? ` in ${i.daysToSell}d` : ""}` : i.listPrice != null ? `listed ${usd(i.listPrice)}${i.ageDays != null ? ` · ${i.ageDays}d ago` : ""}` : "not listed"]
            .filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="shrink-0 text-right">{right}</div>
    </li>
  );
}

function BestWorst({ r }: { r: Report }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Card>
        <Label>Best earners</Label>
        <ul className="mt-2 divide-y divide-line">{r.best.map((i) => <ItemLine key={i.sku + i.name} i={i} right={<p className="font-semibold text-sage">{usd(i.profit)}</p>} />)}</ul>
      </Card>
      <Card>
        <Label>Lowest return on cost</Label>
        <ul className="mt-2 divide-y divide-line">{r.worst.map((i) => <ItemLine key={i.sku + i.name} i={i} right={<><p className="font-semibold">{usd(i.profit)}</p><p className="text-xs text-muted">{pct(i.roi)} on cost</p></>} />)}</ul>
      </Card>
    </div>
  );
}

type Sort = "recent" | "profit" | "roi" | "days" | "age";
function AllItems({ items }: { items: ItemCalc[] }) {
  const [filter, setFilter] = useState<"all" | "sold" | "unsold">("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(25);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const xs = items.filter((i) => (filter === "all" || (filter === "sold") === i.sold) && (!t || `${i.sku} ${i.name}`.toLowerCase().includes(t)));
    const key: Record<Sort, (i: ItemCalc) => number> = {
      recent: (i) => -Date.parse(i.soldDate || i.listed || i.purchased || "1970-01-01"),
      profit: (i) => -(i.profit ?? i.projected ?? -1e9),
      roi: (i) => -(i.roi ?? -1e9),
      days: (i) => i.daysToSell ?? 1e9,
      age: (i) => -(i.ageDays ?? -1),
    };
    return [...xs].sort((a, b) => key[sort](a) - key[sort](b));
  }, [items, filter, sort, q]);
  return (
    <Card>
      <Label>Every item</Label>
      <div className="mt-3 flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or SKU" className={`${input} min-w-0 flex-1`} />
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className={inline}>
          <option value="all">All</option><option value="sold">Sold</option><option value="unsold">Unsold</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={inline}>
          <option value="recent">Newest</option><option value="profit">Most profit</option><option value="roi">Best return</option>
          <option value="days">Fastest sold</option><option value="age">Listed longest</option>
        </select>
      </div>
      <ul className="mt-2 divide-y divide-line">
        {list.slice(0, limit).map((i) => (
          <ItemLine key={i.sku + i.name} i={i} right={i.sold
            ? <><p className={`font-semibold ${(i.profit ?? 0) >= 0 ? "text-sage" : "text-cherry"}`}>{usd(i.profit)}</p><p className="text-xs text-muted">{i.payoutEstimated ? "est. " : ""}payout {usd(i.payout)}</p></>
            : <><p className="font-semibold text-ink-soft">{i.projected != null ? `~${usd(i.projected)}` : "—"}</p><p className="text-xs text-muted">at list price</p></>} />
        ))}
      </ul>
      {list.length > limit && <button onClick={() => setLimit((n) => n + 50)} className="mt-2 w-full rounded-lg border border-line py-2 text-sm font-medium text-ink-soft hover:bg-blush">Show more ({list.length - limit} left)</button>}
      {!list.length && <p className="mt-3 text-sm text-muted">Nothing matches.</p>}
    </Card>
  );
}
