// Her imported inventory lives only in this browser, like her sales history.
import { cleanInventory, DEFAULT_SETTINGS, type InvItem } from "@/lib/inventory";

export const INVENTORY_KEY = "snaplist.inventory.v1";
const SETTINGS_KEY = "snaplist.inventory.settings.v1";

export type InventoryStore = { items: InvItem[]; source: string; sheetUrl?: string; importedAt: number };
export type ShopSettings = { assumeBoosted: boolean; staleDays: number };

export function readInventory(): InventoryStore | null {
  try {
    const v = JSON.parse(localStorage.getItem(INVENTORY_KEY) || "null");
    if (!v || !Array.isArray(v.items)) return null;
    return { items: cleanInventory(v.items), source: String(v.source ?? ""), sheetUrl: typeof v.sheetUrl === "string" ? v.sheetUrl : undefined, importedAt: Number(v.importedAt) || 0 };
  } catch { return null; }
}

export function saveInventory(v: InventoryStore | null) {
  try { if (v) localStorage.setItem(INVENTORY_KEY, JSON.stringify(v)); else localStorage.removeItem(INVENTORY_KEY); } catch { /* storage full or blocked */ }
}

export function readShopSettings(): ShopSettings {
  try {
    const v = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
    return {
      assumeBoosted: typeof v?.assumeBoosted === "boolean" ? v.assumeBoosted : DEFAULT_SETTINGS.assumeBoosted,
      staleDays: Number(v?.staleDays) > 0 ? Number(v.staleDays) : DEFAULT_SETTINGS.staleDays,
    };
  } catch { return { assumeBoosted: DEFAULT_SETTINGS.assumeBoosted, staleDays: DEFAULT_SETTINGS.staleDays }; }
}

export function saveShopSettings(v: ShopSettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(v)); } catch { /* ignore */ }
}

// Ask the browser to keep this site's storage instead of clearing it under
// pressure or after inactivity. Browsers may say no; it never hurts to ask.
export function requestPersistentStorage() {
  try { void navigator.storage?.persist?.(); } catch { /* not supported */ }
}

// iPhone/iPad Safari that isn't running from the home screen — the case where
// saved data is wiped after 7 days without a visit.
export function isIosBrowserTab(): boolean {
  if (typeof navigator === "undefined") return false;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia("(display-mode: standalone)").matches;
  return ios && !standalone;
}
