import { describe, it, expect, vi } from "vitest";
import {
  ORIENTATION_PROBE_JPEG,
  orientationTransform,
  planResize,
  readJpegOrientation,
  swapsAxes,
  type Transform,
} from "@/lib/orientation";
import { resizeImage, type CanvasLike, type ResizeDeps } from "@/lib/resizeImage";

const probeBytes = () => new Uint8Array(Buffer.from(ORIENTATION_PROBE_JPEG.split(",")[1], "base64"));

// SOI, APP1 "Exif\0\0" with one IFD0 entry (tag 0x0112 = orientation), then SOS.
function jpegWithOrientation(orientation: number, little = true): Uint8Array<ArrayBuffer> {
  const u16 = (n: number) => (little ? [n & 0xff, n >> 8] : [n >> 8, n & 0xff]);
  const u32 = (n: number) => (little ? [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24] : [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]);
  const tiff = [
    ...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8),
    ...u16(1), ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0, ...u32(0),
  ];
  const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const size = payload.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, size >> 8, size & 0xff, ...payload, 0xff, 0xda, 0, 2]);
}

describe("readJpegOrientation", () => {
  it("reads the tag in both byte orders", () => {
    for (let o = 1; o <= 8; o++) {
      expect(readJpegOrientation(jpegWithOrientation(o, true))).toBe(o);
      expect(readJpegOrientation(jpegWithOrientation(o, false))).toBe(o);
    }
  });

  it("reads the embedded browser probe as orientation 6", () => {
    expect(readJpegOrientation(probeBytes())).toBe(6);
  });

  it("treats missing, invalid or non-JPEG data as upright", () => {
    const jfifOnly = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xda, 0, 2]);
    expect(readJpegOrientation(jfifOnly)).toBe(1);
    expect(readJpegOrientation(jpegWithOrientation(9))).toBe(1);
    expect(readJpegOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBe(1); // PNG
    expect(readJpegOrientation(jpegWithOrientation(6).subarray(0, 20))).toBe(1); // truncated
    expect(readJpegOrientation(new Uint8Array())).toBe(1);
  });
});

const apply = ([a, b, c, d, e, f]: Transform, x: number, y: number) => [a * x + c * y + e, b * x + d * y + f];

describe("orientationTransform", () => {
  const W = 40, H = 30; // stored size

  it("does nothing for upright or unknown orientations", () => {
    expect(orientationTransform(1, W, H)).toBeNull();
    expect(orientationTransform(0, W, H)).toBeNull();
    expect(orientationTransform(9, W, H)).toBeNull();
  });

  // Where the stored image's top-left pixel must end up, per the EXIF definition of each tag.
  const topLeftLandsAt: Record<number, [number, number]> = {
    2: [W, 0], 3: [W, H], 4: [0, H], 5: [0, 0], 6: [H, 0], 7: [H, W], 8: [0, W],
  };

  it("puts the stored top-left corner where EXIF says, and keeps the image on the canvas", () => {
    for (let o = 2; o <= 8; o++) {
      const t = orientationTransform(o, W, H)!;
      expect(apply(t, 0, 0)).toEqual(topLeftLandsAt[o]);
      const [cw, ch] = swapsAxes(o) ? [H, W] : [W, H];
      for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) {
        const [px, py] = apply(t, x, y);
        expect(px === 0 || px === cw).toBe(true);
        expect(py === 0 || py === ch).toBe(true);
      }
    }
  });
});

describe("planResize", () => {
  it("scales the long side to maxDim and swaps the canvas for quarter turns", () => {
    // A 4032x3024 iPhone photo stored sideways (orientation 6) is a portrait shot.
    expect(planResize(4032, 3024, 6, 900)).toEqual({
      canvasWidth: 675, canvasHeight: 900, drawWidth: 900, drawHeight: 675,
      transform: [0, 1, -1, 0, 675, 0],
    });
    expect(planResize(4032, 3024, 1, 900)).toMatchObject({ canvasWidth: 900, canvasHeight: 675, transform: null });
    expect(planResize(600, 400, 3, 900)).toMatchObject({ canvasWidth: 600, canvasHeight: 400, drawWidth: 600 });
  });
});

function fakeCanvas() {
  const ctx = { transform: vi.fn(), drawImage: vi.fn() };
  const canvas: CanvasLike & { ctx: typeof ctx } = {
    width: 0, height: 0, ctx,
    getContext: () => ctx as unknown as ReturnType<CanvasLike["getContext"]>,
    toDataURL: vi.fn(() => "data:image/jpeg;base64,OUT"),
  };
  return canvas;
}

function deps(opts: { width: number; height: number; applies: boolean }) {
  const canvas = fakeCanvas();
  const bitmap = { kind: "bitmap" } as unknown as CanvasImageSource;
  const d: ResizeDeps = {
    decode: vi.fn(async () => ({ source: bitmap, width: opts.width, height: opts.height })),
    appliesExifOrientation: vi.fn(async () => opts.applies),
    createCanvas: () => canvas,
  };
  return { d, canvas, bitmap };
}

describe("resizeImage", () => {
  // The stored pixels are landscape; the EXIF tag says to turn them into a portrait.
  const sidewaysPhone = new Blob([jpegWithOrientation(6)], { type: "image/jpeg" });

  it("trusts the browser when it already applies EXIF orientation (modern browsers)", async () => {
    // The browser reports the upright (portrait) size and draws upright pixels.
    const { d, canvas, bitmap } = deps({ width: 3024, height: 4032, applies: true });
    expect(await resizeImage(sidewaysPhone, 900, 0.82, d)).toBe("data:image/jpeg;base64,OUT");
    expect([canvas.width, canvas.height]).toEqual([675, 900]);
    expect(canvas.ctx.transform).not.toHaveBeenCalled();
    expect(canvas.ctx.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 675, 900);
    expect(canvas.toDataURL).toHaveBeenCalledWith("image/jpeg", 0.82);
  });

  it("rotates on the canvas when the browser ignores EXIF (older Safari/Chrome/Firefox)", async () => {
    const { d, canvas, bitmap } = deps({ width: 4032, height: 3024, applies: false });
    await resizeImage(sidewaysPhone, 900, 0.82, d);
    expect([canvas.width, canvas.height]).toEqual([675, 900]);
    expect(canvas.ctx.transform).toHaveBeenCalledWith(0, 1, -1, 0, 675, 0);
    expect(canvas.ctx.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 900, 675);
  });

  it("leaves photos without an orientation tag alone", async () => {
    const { d, canvas } = deps({ width: 1200, height: 800, applies: false });
    await resizeImage(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" }), 900, 0.82, d);
    expect([canvas.width, canvas.height]).toEqual([900, 600]);
    expect(canvas.ctx.transform).not.toHaveBeenCalled();
  });

  it("rejects empty or undecodable images so preparePhoto can fall back", async () => {
    const empty = deps({ width: 0, height: 0, applies: true });
    await expect(resizeImage(sidewaysPhone, 900, 0.82, empty.d)).rejects.toThrow("Empty image");
    const broken = deps({ width: 1, height: 1, applies: true });
    broken.d.decode = async () => { throw new Error("Could not load image"); };
    await expect(resizeImage(sidewaysPhone, 900, 0.82, broken.d)).rejects.toThrow("Could not load image");
  });
});
