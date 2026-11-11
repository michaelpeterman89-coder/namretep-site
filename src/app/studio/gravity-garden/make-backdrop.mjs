// Turns NASA's HDR star map into the two backdrop JPGs (laptop and phone sizes).
//
// Source (public domain): NASA/Goddard Space Flight Center Scientific Visualization
// Studio, "Deep Star Maps 2020", https://svs.gsfc.nasa.gov/4851. Gaia DR2: ESA/Gaia/DPAC.
// File used: starmap_2020_4k.exr (celestial coordinates, 4096×2048, linear HDR).
//
// Run from the repo root, with the EXR downloaded somewhere outside the repo:
//   npm install --no-save jpeg-js@0.4.4
//   node src/app/studio/gravity-garden/make-backdrop.mjs path/to/starmap_2020_4k.exr

import { readFileSync, writeFileSync } from "node:fs";
import jpeg from "jpeg-js";
import { FloatType } from "three";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";

const input = process.argv[2];
if (!input) throw new Error("Pass the path to starmap_2020_4k.exr");

const file = readFileSync(input);
const loader = new EXRLoader().setDataType(FloatType);
const { data, width, height } = loader.parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const channels = data.length / (width * height);

/** How bright the sky comes out. The sim also dims it at runtime, so err bright. */
const EXPOSURE = 1.6;

// Linear light → gentle filmic curve → sRGB, so faint dust lanes survive 8 bits.
const toByte = (v) => {
  const x = Math.max(0, v * EXPOSURE);
  const mapped = x / (1 + x * 0.6);
  const srgb = mapped <= 0.0031308 ? 12.92 * mapped : 1.055 * mapped ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(srgb * 255)));
};

function save(name, outW) {
  const scale = width / outW;
  const outH = outW / 2;
  const rgba = Buffer.alloc(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      // Box-average the source pixels this output pixel covers.
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = Math.floor(y * scale); sy < Math.floor((y + 1) * scale); sy++) {
        // EXR rows come out bottom-up from three's loader.
        const row = height - 1 - sy;
        for (let sx = Math.floor(x * scale); sx < Math.floor((x + 1) * scale); sx++) {
          const i = (row * width + sx) * channels;
          r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
        }
      }
      const o = (y * outW + x) * 4;
      rgba[o] = toByte(r / n);
      rgba[o + 1] = toByte(g / n);
      rgba[o + 2] = toByte(b / n);
      rgba[o + 3] = 255;
    }
  }
  const out = jpeg.encode({ data: rgba, width: outW, height: outH }, 82);
  writeFileSync(new URL(`./${name}`, import.meta.url), out.data);
  console.log(`${name} ${outW}x${outH} ${(out.data.length / 1024).toFixed(0)} KB`);
}

save("milky-way-4k.jpg", 4096);
save("milky-way-2k.jpg", 2048);
