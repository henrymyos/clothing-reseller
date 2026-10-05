// Client side of /api/remember: record what she has saved on this device, and
// find out whether something she saved has since been wiped by the browser.
export type Saved = { inventory: boolean; sales: boolean };

export function rememberSaved(v: Saved) {
  void fetch("/api/remember", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(v) }).catch(() => {});
}

export async function whatWasCleared(now: Saved): Promise<Saved> {
  try {
    const had = (await (await fetch("/api/remember", { cache: "no-store" })).json()) as Saved;
    return { inventory: had.inventory && !now.inventory, sales: had.sales && !now.sales };
  } catch {
    return { inventory: false, sales: false };
  }
}

export function clearedMessage(c: Saved): string | null {
  if (!c.inventory && !c.sales) return null;
  const what = c.inventory && c.sales ? "inventory sheet and Depop sales" : c.inventory ? "inventory sheet" : "Depop sales";
  return `Your ${what} ${c.inventory && !c.sales ? "was" : "were"} cleared from this device — Safari deletes saved website data after 7 days without a visit. Load ${c.inventory && c.sales ? "them" : "it"} again under Your data on My shop. Adding SnapList to your Home Screen stops this happening.`;
}
