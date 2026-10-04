"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SHOP = "soldbychica";
const TABS = [
  { href: "/", label: "List an item", short: "List", icon: "📷" },
  { href: "/shop", label: "My shop", short: "My shop", icon: "📈" },
];

// Her two pages: list a new item, and everything about her shop — plus her
// Depop profile, top right on every screen size.
export default function AppNav() {
  const path = usePathname();
  return (
    <nav className="sticky top-0 z-20 border-b border-line bg-cream/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-2.5">
        <Link href="/" className="shrink-0 font-display text-xl font-semibold tracking-tight sm:text-2xl">Snap<span className="text-cherry">List</span></Link>
        <div className="flex rounded-full border border-line-strong bg-surface p-0.5 text-sm">
          {TABS.map((t) => {
            const on = t.href === "/" ? path === "/" : path.startsWith(t.href);
            return (
              <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined}
                className={`whitespace-nowrap rounded-full px-2.5 py-1.5 font-semibold transition sm:px-3 ${on ? "bg-cherry text-white shadow-sm shadow-cherry/30" : "text-ink-soft hover:text-cherry"}`}>
                <span aria-hidden className="mr-1">{t.icon}</span>
                <span className="sm:hidden">{t.short}</span><span className="hidden sm:inline">{t.label}</span>
              </Link>
            );
          })}
        </div>
        <a href={`https://www.depop.com/${SHOP}/`} target="_blank" rel="noopener noreferrer" aria-label={`@${SHOP} on Depop`}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-cherry/25 bg-blush p-0.5 text-xs font-semibold text-cherry hover:border-cherry/50 sm:pr-2.5">
          <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-cherry text-[11px] font-bold uppercase text-white">sc</span>
          <span className="hidden sm:inline">@{SHOP}</span>
        </a>
      </div>
    </nav>
  );
}
