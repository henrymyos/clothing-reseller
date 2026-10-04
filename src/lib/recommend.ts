// Advice for her next buying trips and listings, worked out from her own history:
// what to buy more of and what to pay, what to skip, sizes and brands that sell,
// how to price for offers, whether boosting pays, and when to restock.
// Every recommendation states the numbers behind it.

import { median } from "@/lib/comps";
import { DEFAULT_SETTINGS, payoutAt, type Report, type Settings } from "@/lib/inventory";
import type { Sale } from "@/lib/sales";

export type Rec = {
  kind: "buy" | "skip" | "pay" | "size" | "brand" | "price" | "boost" | "stock" | "markdown";
  title: string;
  detail: string;
};

const med = (xs: number[]) => (xs.length ? median([...xs].sort((a, b) => a - b)) : null);
const usd = (n: number) => `$${n % 1 ? n.toFixed(2) : n}`;
const round = (n: number) => Math.round(n);
const pct = (n: number) => `${Math.round(n * 100)}%`;

export function recommend(r: Report, sales: Sale[] = [], today: string, s: Settings = DEFAULT_SETTINGS): Rec[] {
  const out: Rec[] = [];
  const sold = r.sold;
  if (sold.length < 5) return out;
  const targetProfit = Math.max(3, round(med(sold.map((i) => i.profit!)) ?? 5));

  // 1. What to buy more of, and the most to pay for it.
  const groups = r.groups.filter((g) => g.sold >= 5);
  const score = (g: (typeof groups)[number]) => (g.avgProfit ?? 0) * g.sellThrough / Math.max(1, g.medianDays ?? 1) ** 0.5;
  const ranked = [...groups].sort((a, b) => score(b) - score(a));
  for (const g of ranked.slice(0, 2)) {
    const prices = sold.filter((i) => i.group === g.key).map((i) => i.soldPrice!);
    const typical = med(prices)!;
    const maxPay = Math.floor((payoutAt(typical, s.assumeBoosted, s.fees) - targetProfit) * 2) / 2;
    out.push({
      kind: "buy",
      title: `Buy more ${g.key.toLowerCase()}`,
      detail: `${pct(g.sellThrough)} of them sell${g.medianDays != null ? `, usually in ${g.medianDays} day${g.medianDays === 1 ? "" : "s"}` : ""}, for about ${usd(round(typical))} — ${usd(Math.round(g.avgProfit! * 100) / 100)} profit each.${maxPay >= 1 ? ` To keep making ~${usd(targetProfit)} an item, pay up to ${usd(maxPay)} each.` : ""}`,
    });
  }

  // 2. What piles up or ties money up.
  for (const g of r.groups.filter((x) => x.sold + x.unsold >= 6)) {
    if (ranked.slice(0, 2).some((x) => x.key === g.key)) continue;
    if (g.medianDays != null && g.medianDays >= 14) {
      out.push({ kind: "skip", title: `Be picky with ${g.key.toLowerCase()}`, detail: `They take a median ${g.medianDays} days to sell, so the money sits in stock. Only buy standout pieces.` });
    } else if (g.sellThrough < r.totals.sellThrough * 0.8 && g.unsold >= 5) {
      out.push({ kind: "skip", title: `Slow down on ${g.key.toLowerCase()}`, detail: `Only ${pct(g.sellThrough)} have sold (${g.unsold} still listed) vs ${pct(r.totals.sellThrough)} across the shop. Sell through what you have first.` });
    }
  }

  // 3. Does paying more pay off?
  const cheap = sold.filter((i) => i.cost < 3), dear = sold.filter((i) => i.cost >= 5);
  if (cheap.length >= 5 && dear.length >= 5) {
    const pc = med(cheap.map((i) => i.profit!))!, pd = med(dear.map((i) => i.profit!))!;
    const facts = `Items you paid under $3 for made a median ${usd(Math.round(pc * 100) / 100)}; items you paid $5+ for made ${usd(Math.round(pd * 100) / 100)}.`;
    out.push(Math.abs(pd - pc) < 1
      ? { kind: "pay", title: "What you pay barely changes your profit", detail: `${facts} Pick by what sells, not by the price tag.` }
      : pd > pc
        ? { kind: "pay", title: "Paying more has paid off", detail: `${facts} Don't pass on a good piece over a couple of dollars.` }
        : { kind: "pay", title: "Cheap finds earn more", detail: `${facts} Stick to the bargain racks.` });
  }

  // 4. Sizes and brands that sell (needs her Depop orders, which have sizes and brands).
  if (sales.length >= 10) {
    const sizes = new Map<string, number>();
    for (const x of sales) {
      const z = normSize(x.size);
      if (/^(X*S|M|X*L|[2-5]XL)$/.test(z)) sizes.set(z, (sizes.get(z) ?? 0) + 1);
    }
    const top = [...sizes].sort((a, b) => b[1] - a[1]);
    const counted = top.reduce((n, [, c]) => n + c, 0);
    if (counted >= 10) {
      const lead = top.slice(0, 2);
      const share = lead.reduce((n, [, c]) => n + c, 0) / counted;
      out.push({ kind: "size", title: `Look for ${lead.map(([k]) => k).join(" and ")}`, detail: `${pct(share)} of your Depop sales were ${lead.map(([k, c]) => `${k} (${c})`).join(" or ")}. ${top.slice(-1)[0][1] <= 2 ? `${top.filter(([, c]) => c <= 2).map(([k]) => k).slice(0, 3).join(", ")} have only sold once or twice.` : ""}`.trim() });
    }
    const brands = new Map<string, number[]>();
    for (const x of sales) {
      const b = x.brand.trim();
      if (!b || /^(other|american vintage|unbranded|unknown)$/i.test(b)) continue;
      brands.set(b, [...(brands.get(b) ?? []), x.price]);
    }
    const best = [...brands].filter(([, p]) => p.length >= 3).map(([b, p]) => [b, med(p)!, p.length] as const).sort((a, b) => b[1] - a[1]).slice(0, 4);
    if (best.length >= 2) {
      out.push({ kind: "brand", title: "Brands that sell well for you", detail: best.map(([b, m, n]) => `${b} (${n} sold, ~${usd(round(m))})`).join(", ") + "." });
    }
  }

  // 5. Pricing for offers.
  const offered = sold.filter((i) => (i.offerOff ?? 0) > 0);
  if (offered.length >= 5) {
    const off = med(offered.map((i) => i.offerOff!))!;
    out.push({
      kind: "price",
      title: `List about ${usd(Math.round(off))} above the price you want`,
      detail: `${pct(offered.length / sold.length)} of your sales came in under list, usually ${usd(Math.round(off * 100) / 100)} under. Leave room for the offer so you still get your number.`,
    });
  }

  // 6. Is boosting worth it?
  const known = sold.filter((i) => i.boosted != null && i.daysToSell != null);
  const b = known.filter((i) => i.boosted), nb = known.filter((i) => !i.boosted);
  if (b.length >= 5 && nb.length >= 5) {
    const db = med(b.map((i) => i.daysToSell!))!, dn = med(nb.map((i) => i.daysToSell!))!;
    const fee = r.totals.boostFees ?? 0;
    const helps = dn - db >= 2;
    out.push({
      kind: "boost",
      title: helps ? "Boosting is speeding up sales" : "Boost less",
      detail: `Boosted items sold in a median ${db} day${db === 1 ? "" : "s"}, unboosted in ${dn} (${b.length} vs ${nb.length} sales). Boosting has cost about ${usd(Math.round(fee))} so far at ${s.fees.boostPct}% a sale.${helps ? " Keep boosting the slower kinds of items." : " Unboosted items sell about as fast, so skip the boost on your quick sellers and keep the money."}`,
    });
  } else if (b.length >= 5) {
    out.push({ kind: "boost", title: "Try a few listings without boosting", detail: `Almost every sale was boosted, costing about ${usd(Math.round(r.totals.boostFees ?? 0))}. Leave a few fast sellers unboosted to see if they sell just as quickly.` });
  }

  // 7. Restock timing from the recent selling pace.
  const since = (d: string) => (Date.parse(today) - Date.parse(d)) / 86_400_000;
  const recent = sold.filter((i) => i.soldDate && since(i.soldDate) <= 14).length;
  const perWeek = recent / 2;
  const listed = r.unsold.filter((i) => i.listPrice != null).length;
  if (perWeek >= 1) {
    const weeks = listed / perWeek;
    out.push({
      kind: "stock",
      title: weeks < 2 ? "Time to restock" : `About ${Math.round(weeks)} weeks of stock left`,
      detail: `You've sold ~${Math.round(perWeek)} a week over the last two weeks and have ${listed} listed. ${weeks < 2 ? "Plan a buying trip this week." : `Plan your next big trip in ~${Math.max(1, Math.round(weeks - 1))} week${Math.round(weeks - 1) === 1 ? "" : "s"}, or buy only top sellers until then.`}`,
    });
  }

  // 8. Stale stock.
  if (r.stale.length) {
    const tied = r.stale.reduce((n, x) => n + x.item.cost, 0);
    out.push({ kind: "markdown", title: `Mark down ${r.stale.length} slow item${r.stale.length === 1 ? "" : "s"}`, detail: `They've been listed ${s.staleDays}+ days with ${usd(Math.round(tied))} paid in. Suggested prices are in “Not moving” below.` });
  }
  return out;
}

// "Men's M" / "M" / "Medium" → "M"; waist sizes and kids' sizes are left as-is.
export function normSize(raw: string): string {
  const t = (raw || "").trim().toUpperCase();
  if (!t) return "";
  // Look at whole words only, so the S in "MEN'S" isn't read as a size.
  const bare = t.replace(/\b(MEN|WOMEN|KIDS|US|UK)'?S?\b/g, " ").trim();
  const word = bare.split(/[\s,/()]+/).filter(Boolean).reverse()
    .find((w) => /^(XXXS|XXS|XS|S|M|L|XL|XXL|XXXL|[2-5]XL)$/.test(w));
  if (word) return word;
  if (/^SMALL$/.test(t)) return "S";
  if (/^MEDIUM$/.test(t)) return "M";
  if (/^LARGE$/.test(t)) return "L";
  return (bare || t).slice(0, 8);
}

