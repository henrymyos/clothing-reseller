// Phone cameras save the sensor's pixels as-is and put an EXIF "Orientation" tag (1-8) in the
// JPEG saying how to rotate them. Current browsers (Chrome/Edge 81+, Safari 13.1 / iOS 13.4+,
// Firefox 77+) apply that tag when they decode an <img>, so drawing it to a canvas comes out
// upright. Older ones ignore it, so the resized JPEG (which has no EXIF left) came out sideways.
// We check once whether the browser applies the tag; if it doesn't, we rotate on the canvas.

/** Canvas `transform(a, b, c, d, e, f)` arguments. */
export type Transform = [number, number, number, number, number, number];

/**
 * The EXIF orientation of a JPEG, or 1 (upright) when there isn't one or the bytes aren't a
 * JPEG. Only the bytes up to the image data are needed, so callers can pass the first ~128 KB.
 */
export function readJpegOrientation(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 4 || view.getUint16(0) !== 0xffd8) return 1;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return 1;
    const marker = bytes[offset + 1];
    if (marker === 0xff) { offset++; continue; } // fill byte
    if (marker === 0xda || marker === 0xd9) return 1; // image data / end: no EXIF before it
    const size = view.getUint16(offset + 2);
    if (size < 2) return 1;
    if (marker === 0xe1) {
      const found = exifOrientation(view, offset + 4, offset + 2 + size);
      if (found) return found;
    }
    offset += 2 + size;
  }
  return 1;
}

// Reads tag 0x0112 from IFD0 of an APP1 "Exif\0\0" segment spanning [start, end).
function exifOrientation(view: DataView, start: number, end: number): number | null {
  end = Math.min(end, view.byteLength);
  if (start + 14 > end) return null;
  // "Exif\0\0"
  if (view.getUint32(start) !== 0x45786966 || view.getUint16(start + 4) !== 0) return null;
  const tiff = start + 6;
  const order = view.getUint16(tiff);
  if (order !== 0x4949 && order !== 0x4d4d) return null;
  const little = order === 0x4949;
  if (view.getUint16(tiff + 2, little) !== 42) return null;
  const ifd = tiff + view.getUint32(tiff + 4, little);
  if (ifd + 2 > end) return null;
  const count = view.getUint16(ifd, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) return null;
    if (view.getUint16(entry, little) === 0x0112) {
      const value = view.getUint16(entry + 8, little);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

/** Orientations 5-8 are rotated a quarter turn, so the upright image swaps width and height. */
export function swapsAxes(orientation: number): boolean {
  return orientation >= 5 && orientation <= 8;
}

/**
 * The canvas transform that turns pixels stored with `orientation` upright, where `width` and
 * `height` are the stored (not rotated) size they'll be drawn at: `drawImage(src, 0, 0, w, h)`.
 */
export function orientationTransform(orientation: number, width: number, height: number): Transform | null {
  switch (orientation) {
    case 2: return [-1, 0, 0, 1, width, 0]; // mirrored
    case 3: return [-1, 0, 0, -1, width, height]; // upside down
    case 4: return [1, 0, 0, -1, 0, height]; // mirrored vertically
    case 5: return [0, 1, 1, 0, 0, 0]; // mirrored + quarter turn
    case 6: return [0, 1, -1, 0, height, 0]; // quarter turn clockwise (iPhone held upright)
    case 7: return [0, -1, -1, 0, height, width];
    case 8: return [0, -1, 1, 0, 0, width]; // quarter turn counter-clockwise
    default: return null;
  }
}

export interface ResizePlan {
  /** Size of the output canvas (upright). */
  canvasWidth: number;
  canvasHeight: number;
  /** Size to draw the decoded image at, before the transform. */
  drawWidth: number;
  drawHeight: number;
  transform: Transform | null;
}

/**
 * How to draw a decoded image of `width` x `height` so it fits in `maxDim` and comes out
 * upright. Pass orientation 1 when the browser has already applied the EXIF tag.
 */
export function planResize(width: number, height: number, orientation: number, maxDim: number): ResizePlan {
  const scale = Math.min(1, maxDim / Math.max(width, height));
  const drawWidth = Math.round(width * scale);
  const drawHeight = Math.round(height * scale);
  const swap = swapsAxes(orientation);
  return {
    canvasWidth: swap ? drawHeight : drawWidth,
    canvasHeight: swap ? drawWidth : drawHeight,
    drawWidth,
    drawHeight,
    transform: orientationTransform(orientation, drawWidth, drawHeight),
  };
}

/** A 2x1 white JPEG tagged orientation 6. A browser that applies EXIF decodes it as 1x2. */
export const ORIENTATION_PROBE_JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4QAiRXhpZgAATU0AKgAAAAgAAQESAAMAAAABAAYAAAAAAAD/2wBDAFA3PEY8MlBGQUZaVVBfeMiCeG5uePWvuZHI////////////////////////////////////////////////////wAALCAABAAIBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAABP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8Aa//Z";

let autoOrients: Promise<boolean> | null = null;

/** Whether this browser applies EXIF orientation to decoded <img> elements. Checked once. */
export function browserAppliesExifOrientation(): Promise<boolean> {
  autoOrients ??= new Promise<boolean>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth === 1 && img.naturalHeight === 2);
    // If even this tiny JPEG won't load, assume a modern browser: rotating an image the
    // browser already rotated would be worse than leaving an old browser's photo sideways.
    img.onerror = () => resolve(true);
    img.src = ORIENTATION_PROBE_JPEG;
  });
  return autoOrients;
}
