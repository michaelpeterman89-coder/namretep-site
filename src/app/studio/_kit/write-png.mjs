// Saves RGBA pixels as a PNG, scaled up with hard pixel edges. For experiment
// thumbnail scripts run with Node (no browser, no extra packages).

import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, body) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(body.length);
  const named = Buffer.concat([Buffer.from(type, "latin1"), body]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(named));
  return Buffer.concat([head, named, tail]);
}

/**
 * @param {URL | string} file where to save it
 * @param {number} w width in pixels
 * @param {number} h height in pixels
 * @param {Uint8ClampedArray | Uint8Array} rgba w*h*4 bytes
 * @param {number} scale each pixel becomes a scale×scale block
 */
export function writePng(file, w, h, rgba, scale = 1) {
  const W = w * scale;
  const H = h * scale;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(W, 0);
  header.writeUInt32BE(H, 4);
  header[8] = 8; // bits per channel
  header[9] = 6; // RGBA
  const rows = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    const sy = Math.floor(y / scale);
    for (let x = 0; x < W; x++) {
      const from = (sy * w + Math.floor(x / scale)) * 4;
      const to = y * (W * 4 + 1) + 1 + x * 4;
      for (let c = 0; c < 4; c++) rows[to + c] = rgba[from + c];
    }
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(file, png);
  return png.length;
}

/** A seeded random number generator (0 to 1), so thumbnails come out the same every run. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
