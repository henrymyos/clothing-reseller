// iPhone photos are HEIC. Safari can draw them, but Chrome, Firefox and Edge can't, so the
// resize step used to fail and the photo was quietly skipped. When the browser can't read a
// photo and it turns out to be HEIC/HEIF, we convert it to JPEG first with heic-to (libheif
// compiled to JS). That library is ~3 MB, so it's only downloaded when a HEIC photo needs it.

const HEIC_TYPES = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);
const HEIC_EXT = /\.(heic|heif)$/i;
// ISO-BMFF "ftyp" brands used by HEIC/HEIF stills and bursts.
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"]);

/** True when the first bytes of a file are an HEIC/HEIF header (`....ftyp<brand>`). */
export function sniffHeic(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  return ascii(4, 8) === "ftyp" && HEIC_BRANDS.has(ascii(8, 12).toLowerCase());
}

/** HEIC by MIME type, file name, or (when the browser gives neither) the file's header. */
export async function looksLikeHeic(file: Blob & { name?: string }): Promise<boolean> {
  if (HEIC_TYPES.has(file.type.toLowerCase())) return true;
  if (file.name && HEIC_EXT.test(file.name)) return true;
  try {
    return sniffHeic(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
  } catch {
    return false;
  }
}

export type HeicConverter = (file: Blob) => Promise<Blob>;

/** Loads heic-to on first use (its own chunk) and converts to a full-quality JPEG. */
export const convertHeicToJpeg: HeicConverter = async (file) => {
  const { heicTo } = await import("heic-to/csp");
  return heicTo({ blob: file, type: "image/jpeg", quality: 0.92 });
};

export class PhotoError extends Error {
  constructor(public readonly kind: "unreadable" | "heic", public readonly fileName: string) {
    super(kind === "heic" ? `Could not convert HEIC photo ${fileName}` : `Could not read photo ${fileName}`);
    this.name = "PhotoError";
  }
}

/**
 * Turns a picked photo into an upload-ready JPEG data URL. `resize` does the normal
 * browser decode + downscale; if that fails on a HEIC file, it's converted and resized again.
 * Throws PhotoError so the page can say which photo failed and why.
 */
export async function preparePhoto(
  file: File,
  resize: (image: Blob) => Promise<string>,
  convert: HeicConverter = convertHeicToJpeg,
): Promise<string> {
  try {
    return await resize(file);
  } catch {
    if (!(await looksLikeHeic(file))) throw new PhotoError("unreadable", file.name);
  }
  let jpeg: Blob;
  try {
    jpeg = await convert(file);
  } catch {
    throw new PhotoError("heic", file.name);
  }
  try {
    return await resize(jpeg);
  } catch {
    throw new PhotoError("heic", file.name);
  }
}

/** One message for every photo that failed in a batch. */
export function photoErrorMessage(errors: PhotoError[]): string | null {
  if (!errors.length) return null;
  const names = (es: PhotoError[]) => es.map((e) => e.fileName || "a photo").join(", ");
  const heic = errors.filter((e) => e.kind === "heic");
  const other = errors.filter((e) => e.kind === "unreadable");
  const parts: string[] = [];
  if (heic.length) {
    parts.push(
      `Couldn't convert the iPhone (HEIC) photo${heic.length > 1 ? "s" : ""} ${names(heic)}. ` +
        "Try again, or on the iPhone set Settings → Camera → Formats → Most Compatible so new photos save as JPEG.",
    );
  }
  if (other.length) {
    parts.push(`Couldn't read ${names(other)}. Use a JPEG, PNG or HEIC photo.`);
  }
  return parts.join(" ");
}
