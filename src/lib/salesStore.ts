// Her Depop sales export lives only in this browser, like her inventory sheet.
import { cleanSales, type Sale } from "@/lib/sales";

export const SALES_KEY = "snaplist.sales.v1";
export type SalesStore = { sales: Sale[]; fileName: string; importedAt: number };

export function readSales(): SalesStore | null {
  try {
    const v = JSON.parse(localStorage.getItem(SALES_KEY) || "null");
    return v && Array.isArray(v.sales) ? { sales: cleanSales(v.sales), fileName: String(v.fileName ?? ""), importedAt: Number(v.importedAt) || 0 } : null;
  } catch { return null; }
}

export function saveSales(v: SalesStore | null) {
  try { if (v) localStorage.setItem(SALES_KEY, JSON.stringify(v)); else localStorage.removeItem(SALES_KEY); } catch { /* storage full or blocked */ }
}
