import { describe, it, expect, vi } from "vitest";
import { PhotoError, looksLikeHeic, photoErrorMessage, preparePhoto, sniffHeic } from "@/lib/heic";

// A 12-byte ISO-BMFF header: 4-byte box size, "ftyp", then the major brand.
const header = (brand: string) =>
  new Uint8Array([0, 0, 0, 0x18, ...Array.from("ftyp" + brand, (c) => c.charCodeAt(0))]);
const heicBytes = header("heic");
const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);

describe("HEIC detection", () => {
  it("sniffs HEIC/HEIF brands from the header", () => {
    for (const brand of ["heic", "heix", "mif1", "msf1", "hevc"]) expect(sniffHeic(header(brand))).toBe(true);
    expect(sniffHeic(header("isom"))).toBe(false); // an MP4
    expect(sniffHeic(jpegBytes)).toBe(false);
    expect(sniffHeic(new Uint8Array(4))).toBe(false);
  });

  it("goes by MIME type, then file name, then header", async () => {
    expect(await looksLikeHeic(new File([jpegBytes], "x", { type: "image/heic" }))).toBe(true);
    expect(await looksLikeHeic(new File([jpegBytes], "x", { type: "image/HEIF" }))).toBe(true);
    expect(await looksLikeHeic(new File([jpegBytes], "IMG_0042.HEIC"))).toBe(true);
    // Chrome on Windows often gives no type; AirDropped copies can lose the extension.
    expect(await looksLikeHeic(new File([heicBytes], "photo"))).toBe(true);
    expect(await looksLikeHeic(new File([jpegBytes], "photo.jpg", { type: "image/jpeg" }))).toBe(false);
  });
});

describe("preparePhoto", () => {
  it("uses the normal resize for photos the browser can read, without loading the converter", async () => {
    const resize = vi.fn(async () => "data:image/jpeg;base64,AAA");
    const convert = vi.fn();
    const file = new File([jpegBytes], "shot.png", { type: "image/png" });
    expect(await preparePhoto(file, resize, convert)).toBe("data:image/jpeg;base64,AAA");
    expect(resize).toHaveBeenCalledWith(file);
    expect(convert).not.toHaveBeenCalled();
  });

  it("does not convert HEIC when the browser decodes it natively (Safari)", async () => {
    const resize = vi.fn(async () => "data:image/jpeg;base64,SAFARI");
    const convert = vi.fn();
    const file = new File([heicBytes], "IMG_1.HEIC", { type: "image/heic" });
    expect(await preparePhoto(file, resize, convert)).toBe("data:image/jpeg;base64,SAFARI");
    expect(convert).not.toHaveBeenCalled();
  });

  it("converts HEIC to JPEG when the browser can't decode it, then resizes the JPEG", async () => {
    const jpeg = new Blob([jpegBytes], { type: "image/jpeg" });
    const resize = vi
      .fn<(b: Blob) => Promise<string>>()
      .mockRejectedValueOnce(new Error("Could not load image"))
      .mockResolvedValueOnce("data:image/jpeg;base64,CONVERTED");
    const convert = vi.fn(async () => jpeg);
    const file = new File([heicBytes], "IMG_2.HEIC", { type: "image/heic" });
    expect(await preparePhoto(file, resize, convert)).toBe("data:image/jpeg;base64,CONVERTED");
    expect(convert).toHaveBeenCalledWith(file);
    expect(resize).toHaveBeenLastCalledWith(jpeg);
  });

  it("reports a HEIC error when conversion fails", async () => {
    const resize = vi.fn(async () => { throw new Error("no decode"); });
    const convert = vi.fn(async () => { throw new Error("libheif: unsupported"); });
    const file = new File([heicBytes], "IMG_3.HEIC");
    const err = await preparePhoto(file, resize, convert).catch((e) => e);
    expect(err).toBeInstanceOf(PhotoError);
    expect(err).toMatchObject({ kind: "heic", fileName: "IMG_3.HEIC" });
  });

  it("reports a HEIC error when the converted JPEG still won't load", async () => {
    const resize = vi.fn(async () => { throw new Error("no decode"); });
    const convert = vi.fn(async () => new Blob([jpegBytes], { type: "image/jpeg" }));
    const err = await preparePhoto(new File([heicBytes], "IMG_4.heic"), resize, convert).catch((e) => e);
    expect(err).toMatchObject({ kind: "heic" });
    expect(resize).toHaveBeenCalledTimes(2);
  });

  it("calls a non-HEIC file it can't read unreadable, and never tries the converter", async () => {
    const resize = vi.fn(async () => { throw new Error("no decode"); });
    const convert = vi.fn();
    const err = await preparePhoto(new File([jpegBytes], "notes.pdf", { type: "application/pdf" }), resize, convert).catch((e) => e);
    expect(err).toMatchObject({ kind: "unreadable", fileName: "notes.pdf" });
    expect(convert).not.toHaveBeenCalled();
  });
});

describe("photoErrorMessage", () => {
  it("is null when nothing failed", () => {
    expect(photoErrorMessage([])).toBeNull();
  });
  it("names the failed HEIC photos and gives the iPhone workaround", () => {
    const msg = photoErrorMessage([new PhotoError("heic", "IMG_1.HEIC"), new PhotoError("heic", "IMG_2.HEIC")]);
    expect(msg).toMatch(/iPhone \(HEIC\) photos IMG_1\.HEIC, IMG_2\.HEIC/);
    expect(msg).toMatch(/Most Compatible/);
  });
  it("covers both kinds at once", () => {
    const msg = photoErrorMessage([new PhotoError("unreadable", "a.pdf"), new PhotoError("heic", "b.heic")]);
    expect(msg).toMatch(/HEIC\) photo b\.heic\./);
    expect(msg).toMatch(/Couldn't read a\.pdf/);
  });
});
