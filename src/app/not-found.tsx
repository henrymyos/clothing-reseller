import Link from "next/link";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-cream px-6 py-20 text-center text-ink">
      <p className="text-5xl" aria-hidden>🧥</p>
      <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 text-muted">That link doesn&apos;t lead anywhere in SnapList.</p>
      <div className="mt-6 flex gap-3">
        <Link href="/" className="rounded-lg bg-cherry px-4 py-2 text-sm font-semibold text-on-cherry hover:bg-cherry-dark">
          List an item
        </Link>
        <Link href="/shop" className="rounded-lg border border-line-strong px-4 py-2 text-sm font-semibold">
          My shop
        </Link>
      </div>
    </main>
  );
}
