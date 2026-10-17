import { browserAppliesExifOrientation, planResize, readJpegOrientation } from "@/lib/orientation";

// Decodes with <img> rather than createImageBitmap: Safari can only decode HEIC through <img>
// (preparePhoto relies on that), and createImageBitmap's `imageOrientation: "from-image"`
// option is ignored by older browsers, so it wouldn't remove the need for a fallback anyway.

export interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
}

export interface CanvasLike {
  width: number;
  height: number;
  getContext(type: "2d"): Pick<CanvasRenderingContext2D, "drawImage" | "transform"> | null;
  toDataURL(type: string, quality: number): string;
}

export interface ResizeDeps {
  decode(file: Blob): Promise<Decoded>;
  appliesExifOrientation(): Promise<boolean>;
  createCanvas(): CanvasLike;
}

const browserDeps: ResizeDeps = {
  decode: (file) =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ source: img, width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not load image")); };
      img.src = url;
    }),
  appliesExifOrientation: browserAppliesExifOrientation,
  createCanvas: () => document.createElement("canvas"),
};

/** EXIF orientation of a JPEG blob (1 if none). EXIF sits near the start, so 128 KB is plenty. */
export async function blobOrientation(file: Blob): Promise<number> {
  try {
    return readJpegOrientation(new Uint8Array(await file.slice(0, 128 * 1024).arrayBuffer()));
  } catch {
    return 1;
  }
}

/**
 * Resize a picked image to fit within maxDim and re-encode it as an upright JPEG to keep the
 * upload small. Rejects when the browser can't decode it (e.g. HEIC outside Safari);
 * preparePhoto handles that.
 */
export async function resizeImage(
  file: Blob,
  maxDim: number,
  quality: number,
  deps: ResizeDeps = browserDeps,
): Promise<string> {
  const { source, width, height } = await deps.decode(file);
  if (!width || !height) throw new Error("Empty image");
  // When the browser already applied the tag, width/height are upright and so are the pixels.
  const orientation = (await deps.appliesExifOrientation()) ? 1 : await blobOrientation(file);
  const plan = planResize(width, height, orientation, maxDim);
  const canvas = deps.createCanvas();
  canvas.width = plan.canvasWidth;
  canvas.height = plan.canvasHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  if (plan.transform) ctx.transform(...plan.transform);
  ctx.drawImage(source, 0, 0, plan.drawWidth, plan.drawHeight);
  return canvas.toDataURL("image/jpeg", quality);
}
