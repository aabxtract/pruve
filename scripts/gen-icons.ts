/**
 * Generates the PWA icon set with no image dependencies.
 *
 * Hand-rolled PNG encoder + signed-distance-field rendering, so the icons are
 * reproducible from source and there is no binary blob in the repo to lose.
 * Run: npm run icons
 */
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";

// ----------------------------------------------------------------- PNG
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** rgba: RGBA bytes, row-major, length = w*h*4 */
function encodePng(rgba: Uint8Array, w: number, h: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Each scanline gets a leading filter byte (0 = None).
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(
      raw,
      y * (w * 4 + 1) + 1
    );
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// -------------------------------------------------------------- drawing
type RGB = [number, number, number];
const BG: RGB = [9, 9, 11]; // zinc-950, matches the app background
const FG: RGB = [255, 255, 255];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Smooth 0..1 coverage from a signed distance, antialiased over ~1.2px. */
const cov = (d: number, px: number) => clamp01(0.5 - d / (1.2 * px));

/** Signed distance to a rounded rectangle centred at origin. */
function sdRoundRect(x: number, y: number, hw: number, hh: number, r: number) {
  const qx = Math.abs(x) - hw + r;
  const qy = Math.abs(y) - hh + r;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Signed distance to a thick line segment (a capsule). */
function sdSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
  r: number
) {
  const pax = px - ax, pay = py - ay;
  const bax = bx - ax, bay = by - ay;
  const h = clamp01((pax * bax + pay * bay) / (bax * bax + bay * bay));
  return Math.hypot(pax - bax * h, pay - bay * h) - r;
}

interface Opts {
  /** Full-bleed square (maskable / apple) vs rounded tile. */
  bleed?: boolean;
  /** Fraction of the canvas the mark occupies. Maskable needs a safe zone. */
  scale?: number;
}

function render(size: number, { bleed = false, scale = 0.62 }: Opts = {}): Buffer {
  const out = new Uint8Array(size * size * 4);
  const px = 1 / size; // one pixel in normalised units
  const half = 0.5;

  // A check mark: the app's own "verified" vocabulary, legible at 48px.
  const S = scale;
  const ax = 0.5 - 0.24 * S, ay = 0.5 + 0.02 * S;
  const bx = 0.5 - 0.07 * S, by = 0.5 + 0.19 * S;
  const cx = 0.5 + 0.25 * S, cy = 0.5 - 0.20 * S;
  const stroke = 0.082 * S;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;

      // Background tile
      let bgA: number;
      if (bleed) {
        bgA = 1;
      } else {
        const d = sdRoundRect(u - half, v - half, 0.5, 0.5, 0.22);
        bgA = cov(d, px);
      }

      // Mark
      const d1 = sdSegment(u, v, ax, ay, bx, by, stroke / 2);
      const d2 = sdSegment(u, v, bx, by, cx, cy, stroke / 2);
      const fgA = cov(Math.min(d1, d2), px) * bgA;

      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) {
        out[i + c] = Math.round(BG[c] * (1 - fgA) + FG[c] * fgA);
      }
      out[i + 3] = Math.round(255 * bgA);
    }
  }

  return encodePng(out, size, size);
}

// ----------------------------------------------------------------- write
const targets: Array<{ file: string; size: number; opts?: Opts }> = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  // Android maskable icons are cropped to a circle/squircle: keep the mark
  // inside the centre 80% safe zone and let the background run full bleed.
  { file: "icon-maskable-512.png", size: 512, opts: { bleed: true, scale: 0.45 } },
  // iOS applies its own corner mask, so ship a square.
  { file: "apple-touch-icon.png", size: 180, opts: { bleed: true, scale: 0.58 } },
];

for (const app of ["holder", "verifier"]) {
  const dir = path.resolve(import.meta.dirname, `../apps/${app}/public`);
  fs.mkdirSync(dir, { recursive: true });
  for (const { file, size, opts } of targets) {
    const png = render(size, opts);
    fs.writeFileSync(path.join(dir, file), png);
    console.log(`apps/${app}/public/${file}  ${size}x${size}  ${png.length} bytes`);
  }
  // favicon.ico slot: modern browsers accept a PNG at /icon.png via Next metadata
  fs.writeFileSync(path.join(dir, "favicon.png"), render(64, { bleed: true, scale: 0.62 }));
}
console.log("done");
