"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import Link from "next/link";

// Replaces Next's bare "Application error" when a page throws; the nav stays.
// retry() re-renders the failed page.
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-cream px-6 py-20 text-center text-ink">
      <p className="text-5xl" aria-hidden>🔌</p>
      <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight">This page didn&apos;t load</h1>
      <p className="mt-2 text-muted">Something went wrong on our side. Try again in a moment.</p>
      <div className="mt-6 flex gap-3">
        <button onClick={() => retry()} className="rounded-lg bg-cherry px-4 py-2 text-sm font-semibold text-on-cherry hover:bg-cherry-dark">
          Try again
        </button>
        <Link href="/" className="rounded-lg border border-line-strong px-4 py-2 text-sm font-semibold">
          List an item
        </Link>
      </div>
    </main>
  );
}
