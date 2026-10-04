// Small building blocks shared by the listing page and the shop page.
import type React from "react";

export const input = "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm focus:border-cherry focus:outline-none focus:ring-2 focus:ring-cherry/15";

export function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-line bg-surface p-5 card-shadow">{children}</div>;
}
export function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium uppercase tracking-wide text-muted">{children}</p>;
}
