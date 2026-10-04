"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SHOP = "soldbychica";
const TABS = [
  { href: "/", label: "List an item", icon: "📷" },
  { href: "/shop", label: "My shop", icon: "📈" },
];

// Her two pages: list a new item, and everything about her shop.
export default function AppNav() {
  const path = usePathname();
  return (
    <nav className="sticky top-0 z-20 border-b border-line bg-cream/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2.5">
        <Link href="/" className="font-display text-2xl font-semibold tracking-tight">Snap<span className="text-cherry">List</span></Link>
        <div className="flex rounded-full border border-line-strong bg-surface p-0.5 text-sm">
          {TABS.map((t) => {
            const on = t.href === "/" ? path === "/" : path.startsWith(t.href);
            return (
              <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 font-semibold transition ${on ? "bg-cherry text-white shadow-sm shadow-cherry/30" : "text-ink-soft hover:text-cherry"}`}>
                <span aria-hidden className="mr-1">{t.icon}</span>{t.label}
              </Link>
            );
          })}
        </div>
        <a href={`https://www.depop.com/${SHOP}/`} target="_blank" rel="noopener noreferrer" className="hidden text-xs font-semibold text-cherry hover:underline sm:block">@{SHOP}</a>
      </div>
    </nav>
  );
}
