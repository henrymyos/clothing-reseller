"use client";

import { useRef, useState } from "react";
import type { Analysis, AnalyzeResponse } from "@/lib/schema";

type Status = "idle" | "loading" | "done" | "error";

const platformLabel: Record<Analysis["platform"], string> = {
  depop: "Depop",
  ebay: "eBay",
  both: "Depop + eBay",
};

const platformColor: Record<Analysis["platform"], string> = {
  depop: "bg-red-500",
  ebay: "bg-blue-600",
  both: "bg-gradient-to-r from-red-500 to-blue-600",
};

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function onPick(file: File) {
    setResult(null);
    setError(null);
    setStatus("idle");
    try {
      // Downscale in the browser so the upload stays well under the request size limit.
      const resized = await resizeImage(file, 1024, 0.85);
      setImage(resized);
    } catch {
      const reader = new FileReader();
      reader.onload = () => setImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  }

  async function analyze() {
    if (!image) return;
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
      });
      const text = await res.text();
      let data: AnalyzeResponse & { error?: string };
      try {
        data = JSON.parse(text);
      } catch {
        // Server returned non-JSON (e.g. a 413 size error) — surface it readably.
        throw new Error(
          res.status === 413
            ? "That photo is too large. Try a slightly smaller or lower-resolution image."
            : text.slice(0, 160) || `Request failed (${res.status})`
        );
      }
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setResult(data as AnalyzeResponse);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setStatus("error");
    }
  }

  function copyListing() {
    if (!result) return;
    const text = `${result.title}\n\n${result.description}\n\nBrand: ${result.brand}\nCondition: ${result.condition}\nColor: ${result.color}\nSize: ${result.size}\nPrice: $${result.suggestedPrice}\n\nTags: ${result.tags.join(", ")}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">SnapList</h1>
          <p className="mt-1 text-neutral-500">
            Photograph a clothing item — get the best platform, price, and a ready-to-post listing.
          </p>
        </header>

        {/* Uploader */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex aspect-square w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50 transition hover:border-neutral-400"
          >
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="item" className="h-full w-full object-contain" />
            ) : (
              <div className="px-6 text-center text-neutral-400">
                <div className="text-4xl">📷</div>
                <p className="mt-2 text-sm">Tap to take or upload a photo</p>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
          />

          <div className="mt-4 flex gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 rounded-xl border border-neutral-300 bg-white py-3 font-medium transition hover:bg-neutral-100"
            >
              {image ? "Change photo" : "Choose photo"}
            </button>
            <button
              onClick={analyze}
              disabled={!image || status === "loading"}
              className="flex-1 rounded-xl bg-neutral-900 py-3 font-medium text-white transition hover:bg-neutral-700 disabled:opacity-40"
            >
              {status === "loading" ? "Analyzing…" : "Analyze"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Results */}
        {result && status === "done" && (
          <div className="mt-6 space-y-4">
            {/* Platform + price headline */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                  List on
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className={`inline-block rounded-full px-3 py-1 text-sm font-semibold text-white ${platformColor[result.platform]}`}
                  >
                    {platformLabel[result.platform]}
                  </span>
                </div>
                <p className="mt-2 text-sm text-neutral-500">{result.platformReasoning}</p>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                  Suggested price
                </p>
                <p className="mt-2 text-3xl font-bold">${result.suggestedPrice}</p>
                <p className="text-sm text-neutral-500">
                  Typical range ${result.priceLow}–${result.priceHigh}
                </p>
                <p className="mt-2 text-sm text-neutral-500">{result.priceReasoning}</p>
                {result.marketData ? (
                  <p className="mt-2 inline-block rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                    ✓ Based on {result.marketData.sampleSize} live eBay listings (median $
                    {result.marketData.median})
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-neutral-400">AI estimate (no live eBay data)</p>
                )}
              </div>
            </div>

            {/* Live eBay comps */}
            {result.marketData && result.marketData.samples.length > 0 && (
              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                  Comparable eBay listings
                </p>
                <ul className="mt-3 space-y-2">
                  {result.marketData.samples.map((s) => (
                    <li key={s.url} className="flex items-center justify-between gap-3 text-sm">
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-blue-600 hover:underline"
                      >
                        {s.title}
                      </a>
                      <span className="shrink-0 font-medium">${s.price}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Listing */}
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold">{result.title}</h2>
                <button
                  onClick={copyListing}
                  className="shrink-0 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium transition hover:bg-neutral-100"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="mt-2 text-neutral-700">{result.description}</p>

              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <Detail label="Brand" value={result.brand} />
                <Detail label="Type" value={result.itemType} />
                <Detail label="Condition" value={result.condition} />
                <Detail label="Color" value={result.color} />
                <Detail label="Material" value={result.material} />
                <Detail label="Size" value={result.size} />
              </dl>

              {result.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {result.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-600"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}

              <p className="mt-4 text-xs text-neutral-400">
                Confidence: {result.confidence} · Prices are estimates — double-check recent sold
                listings before pricing.
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

// Resize a picked image to fit within maxDim and re-encode as JPEG to shrink the upload.
function resizeImage(file: File, maxDim: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > height && width > maxDim) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else if (height >= width && height > maxDim) {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas unavailable"));
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load image"));
    };
    img.src = url;
  });
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-neutral-400">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
