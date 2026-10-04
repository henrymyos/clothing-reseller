// A Google Sheets share link → its CSV export URL (first tab unless the link
// names one). Anything that isn't a docs.google.com spreadsheet link is refused.
export function sheetExportUrl(link: string): string | null {
  let u: URL;
  try { u = new URL(link.trim()); } catch { return null; }
  if (u.protocol !== "https:" || u.hostname !== "docs.google.com") return null;
  const id = u.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/)?.[1];
  if (!id) return null;
  const gid = (u.hash.match(/gid=(\d+)/) ?? u.search.match(/gid=(\d+)/))?.[1] ?? "0";
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}
