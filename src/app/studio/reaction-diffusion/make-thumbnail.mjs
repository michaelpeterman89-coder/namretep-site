// Grows a coral pattern with the real simulation and saves it as thumbnail.png.
// Run from the repo root: node src/app/studio/reaction-diffusion/make-thumbnail.mjs

import { seeded, writePng } from "../_kit/write-png.mjs";
import { GrayScott, PRESETS, colorRamp, paint } from "./gray-scott.ts";

const W = 160;
const H = 120;
const coral = PRESETS.find((p) => p.key === "coral");

const sim = new GrayScott(W, H);
sim.scatter(12, 4, seeded(7));
sim.step(coral.feed, coral.kill, 3000);

const rgba = new Uint8ClampedArray(W * H * 4);
paint(sim, colorRamp(coral.colors), rgba);
const bytes = writePng(new URL("./thumbnail.png", import.meta.url), W, H, rgba, 3);
console.log(`thumbnail.png ${W * 3}x${H * 3} ${(bytes / 1024).toFixed(1)} KB`);
