// Draws the site's deep-space backdrop as small pixel-art PNGs in public/deep-space.
// Original art inspired by real objects, seeded so every run gives the same images.
// Run after changing it: node scripts/generate-deep-space.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const OUT = new URL("../public/deep-space/", import.meta.url);

// ---------- Numbers ----------

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const gauss = (d, width) => Math.exp(-((d / width) ** 2));

function hash(x, y, seed) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  return mix(
    mix(hash(xi, yi, seed), hash(xi + 1, yi, seed), u),
    mix(hash(xi, yi + 1, seed), hash(xi + 1, yi + 1, seed), u),
    v,
  );
}

/** Layered noise, about 0 to 1: soft clouds. */
function fbm(x, y, seed, octaves = 5) {
  let sum = 0;
  let amp = 0.5;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x, y, seed + i * 17) * amp;
    total += amp;
    amp *= 0.5;
    x *= 2.03;
    y *= 2.03;
  }
  return sum / total;
}

/** Layered noise with thin bright creases: filaments. */
function ridged(x, y, seed, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    sum += (1 - Math.abs(noise(x, y, seed + i * 23) * 2 - 1)) * amp;
    total += amp;
    amp *= 0.55;
    x *= 2.1;
    y *= 2.1;
  }
  return sum / total;
}

// ---------- Drawing ----------

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Light adds up and sets its own transparency, so it glows over the page's background. */
function light(r, g, b) {
  const a = clamp(Math.max(r, g, b));
  return a > 0 ? [r / Math.max(r, g, b), g / Math.max(r, g, b), b / Math.max(r, g, b), a] : [0, 0, 0, 0];
}

function over(top, under) {
  const a = top[3] + under[3] * (1 - top[3]);
  if (a <= 0) return [0, 0, 0, 0];
  const blend = (i) => (top[i] * top[3] + under[i] * under[3] * (1 - top[3])) / a;
  return [blend(0), blend(1), blend(2), a];
}

/**
 * Renders a sprite. `pixel(x, y)` gets coordinates where the shorter side runs
 * -1 to 1 and returns [r, g, b, a]. Colors and transparency are reduced to a few
 * steps with an ordered dither for the retro look (and tiny files).
 */
function sprite(name, w, h, pixel, points = []) {
  const data = Buffer.alloc(w * h * 4);
  const unit = Math.min(w, h) / 2;
  const put = (px, py, [r, g, b, a]) => {
    const i = (py * w + px) * 4;
    const threshold = (BAYER[(py % 4) * 4 + (px % 4)] + 0.5) / 16;
    const step = (v, levels) => Math.floor(clamp(v) * levels + threshold) / levels;
    data[i] = Math.round(step(r, 12) * 255);
    data[i + 1] = Math.round(step(g, 12) * 255);
    data[i + 2] = Math.round(step(b, 12) * 255);
    const alpha = Math.round(step(a, 6) * 255);
    data[i + 3] = alpha;
    if (alpha === 0) data[i] = data[i + 1] = data[i + 2] = 0;
  };
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const x = (px + 0.5 - w / 2) / unit;
      const y = (py + 0.5 - h / 2) / unit;
      const color = pixel(x, y);
      // Nothing may reach the image's edge, or its rectangle would show.
      const edge = Math.min(px + 0.5, w - px - 0.5, py + 0.5, h - py - 0.5);
      put(px, py, [color[0], color[1], color[2], color[3] * smooth(0, 10, edge)]);
    }
  }
  for (const [x, y, r, g, b, a = 1] of points) {
    const px = Math.round(x * unit + w / 2);
    const py = Math.round(y * unit + h / 2);
    if (px < 1 || py < 1 || px >= w - 1 || py >= h - 1) continue;
    const i = (py * w + px) * 4;
    const under = [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, data[i + 3] / 255];
    const [nr, ng, nb, na] = over([r, g, b, a], under);
    data[i] = Math.round(nr * 255);
    data[i + 1] = Math.round(ng * 255);
    data[i + 2] = Math.round(nb * 255);
    data[i + 3] = Math.round(na * 255);
  }
  const file = encodePng(w, h, data);
  writeFileSync(new URL(`${name}.png`, OUT), file);
  console.log(`${name}.png ${w}x${h} ${(file.length / 1024).toFixed(1)} KB`);
}

function stars(seed, count, spreadX, spreadY, colors = [[1, 1, 1], [0.75, 0.88, 1], [1, 0.85, 0.65]]) {
  const random = rng(seed);
  return Array.from({ length: count }, () => {
    const [r, g, b] = colors[Math.floor(random() * colors.length)];
    return [(random() * 2 - 1) * spreadX, (random() * 2 - 1) * spreadY, r, g, b, 0.45 + random() * 0.55];
  });
}

// ---------- PNG ----------

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

function encodePng(w, h, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(w, 0);
  header.writeUInt32BE(h, 4);
  header[8] = 8; // bits per channel
  header[9] = 6; // RGBA
  const rows = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    rgba.copy(rows, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- The objects ----------

mkdirSync(OUT, { recursive: true });

// A face-on spiral with a small companion at the end of one arm.
sprite(
  "whirlpool",
  150,
  130,
  (x, y) => {
    const cx = x + 0.12;
    const cy = (y - 0.04) / 0.86;
    const r = Math.hypot(cx, cy) + 0.001;
    const angle = Math.atan2(cy, cx);
    const wobble = fbm(x * 3 + 4, y * 3 + 4, 11) * 1.4;
    const arm = (0.5 + 0.5 * Math.cos(angle * 2 - Math.log(r) * 3.6 + wobble)) ** 3;
    const disk = Math.exp(-r * 2.7) * smooth(1.02, 0.55, r);
    const clumps = smooth(0.62, 0.78, fbm(x * 9, y * 9, 12, 3));
    const glow = disk * (0.22 + arm * 1.5);
    const core = gauss(r, 0.17);
    const companion = gauss(Math.hypot(x - 0.72, y + 0.56), 0.11);
    const bridge = gauss(Math.abs(x - 0.45 - (y + 0.3) * -0.9 - (y + 0.3) ** 2 * 0.9), 0.07) * smooth(-0.62, -0.42, y) * smooth(0.02, -0.25, y) * 0.1;
    return light(
      glow * 0.56 + core * 1.05 + clumps * arm * disk * 1.25 + companion * 0.9 + bridge * 0.6,
      glow * 0.72 + core * 0.86 + clumps * arm * disk * 0.45 + companion * 0.72 + bridge * 0.65,
      glow * 1.08 + core * 0.58 + clumps * arm * disk * 0.8 + companion * 0.45 + bridge * 0.9,
    );
  },
  stars(101, 14, 1.1, 0.9),
);

// A big spiral seen nearly edge-on, with dust lanes and two small satellites.
sprite(
  "andromeda",
  260,
  130,
  (x, y) => {
    const tilt = -0.42;
    const u = x * Math.cos(tilt) - y * Math.sin(tilt);
    const v = (x * Math.sin(tilt) + y * Math.cos(tilt)) / 0.27;
    const r = Math.hypot(u, v);
    const lanes = 0.5 + 0.5 * Math.cos(r * 21 + fbm(u * 3, v * 3, 21) * 3);
    const dust = 1 - lanes ** 2 * 0.72 * smooth(0.14, 0.32, r);
    const disk = Math.exp(-r * 2) * smooth(1.75, 0.95, r) * dust;
    const core = gauss(r, 0.2);
    const warm = gauss(r, 0.62);
    const sat1 = gauss(Math.hypot(x + 0.18, y - 0.42), 0.055);
    const sat2 = gauss(Math.hypot(x - 0.62, y + 0.62) / 1.5, 0.07);
    return light(
      disk * mix(0.56, 1.05, warm) + core * 0.85 + sat1 * 0.75 + sat2 * 0.5,
      disk * mix(0.7, 0.85, warm) + core * 0.72 + sat1 * 0.65 + sat2 * 0.45,
      disk * mix(1.08, 0.58, warm) + core * 0.52 + sat1 * 0.5 + sat2 * 0.4,
    );
  },
  stars(102, 22, 1.9, 0.9),
);

// Tall dark columns of dust, their tips lit against glowing gas.
const COLUMNS = [
  { foot: -0.38, top: -0.68, lean: 0.2, width: 0.2 },
  { foot: 0.1, top: -0.22, lean: 0.09, width: 0.15 },
  { foot: 0.46, top: 0.12, lean: 0.12, width: 0.11 },
];
sprite(
  "pillars",
  160,
  200,
  (x, y) => {
    const cloud = fbm(x * 2.4 + 8, y * 2.4 + 3, 31);
    const fade = smooth(0.98, 0.25, Math.hypot(x / 0.92, (y + 0.08) / 1.12));
    const gas = smooth(0.25, 0.72, cloud) * fade;
    const gold = smooth(0.42, 0.68, fbm(x * 1.5, y * 1.5 + 6, 33));
    const back = light(gas * mix(0.16, 0.95, gold), gas * mix(0.62, 0.68, gold), gas * mix(0.72, 0.32, gold));

    let inside = 0;
    let tip = 0;
    for (const c of COLUMNS) {
      const along = clamp((y - c.top) / (1.25 - c.top));
      const center = c.foot + c.lean * (y - 1);
      const width = c.width * (0.45 + 0.75 * along ** 0.8) * smooth(c.top - 0.05, c.top + 0.08, y);
      const edge = (fbm(x * 8, y * 8, 32 + c.foot * 9, 4) - 0.5) * 0.17;
      const d = width - Math.abs(x - center) + edge;
      inside = Math.max(inside, smooth(-0.012, 0.012, d));
      tip = Math.max(tip, smooth(0.075, 0, Math.abs(d)) * gauss(y - c.top, 0.42));
    }
    const floorFade = smooth(1.2, 0.72, y);
    const column = [mix(0.17, 1, tip), mix(0.1, 0.72, tip), mix(0.11, 0.42, tip), inside * 0.94 * floorFade];
    return over(column, back);
  },
  stars(103, 26, 0.95, 1.2),
);

// A rugged wall of dust below bright blue gas, like a cliff at dawn.
sprite(
  "cliffs",
  280,
  130,
  (x, y) => {
    const ridge = 0.08 + (fbm(x * 1.2 + 6, 4, 41) - 0.5) * 1.15 + (ridged(x * 3.6, 5, 42, 3) - 0.7) * 0.32;
    const rough = (fbm(x * 8, y * 8, 43, 4) - 0.5) * 0.14;
    const depth = y - ridge - rough;
    const sides = smooth(2.05, 0.95, Math.abs(x));
    const gas = fbm(x * 2 + 3, y * 3, 44);
    const above = smooth(-0.82, -0.05, depth) * smooth(0.05, -0.05, depth) * smooth(0.25, 0.75, gas) * sides * smooth(-0.98, -0.45, y);
    const sky = light(above * 0.32, above * 0.72, above * 1.05);
    const lit = gauss(Math.max(depth, 0), 0.14) * (0.45 + gas);
    const shade = fbm(x * 5, y * 5, 45);
    const cliff = [
      mix(0.24, 1, clamp(lit)),
      mix(0.11, 0.62, clamp(lit)) + shade * 0.06,
      mix(0.09, 0.3, clamp(lit)),
      smooth(-0.015, 0.03, depth) * sides * smooth(0.98, 0.2, y) * 0.92,
    ];
    return over(cliff, sky);
  },
  stars(104, 34, 2.1, 0.55),
);

// The wreck of a supernova: a tangle of red filaments around a blue-white haze.
sprite(
  "crab",
  130,
  115,
  (x, y) => {
    const u = x / 1.02;
    const v = y / 0.8;
    const angle = Math.atan2(v, u);
    const r = Math.hypot(u, v) + (fbm(Math.cos(angle) * 2 + 3, Math.sin(angle) * 2 + 3, 51) - 0.5) * 0.42;
    const shell = smooth(0.9, 0.68, r);
    const threads = smooth(0.66, 0.9, ridged(x * 4.2 + 1, y * 4.2, 52, 4));
    const haze = gauss(r, 0.5) * smooth(0.2, 0.75, fbm(x * 3, y * 3, 53));
    const orange = fbm(x * 2 + 7, y * 2, 54);
    const f = threads * shell * 1.25;
    return light(
      f * 1.08 + haze * 0.42,
      f * mix(0.28, 0.72, orange) + haze * 0.62,
      f * 0.2 + haze * 1.02,
    );
  },
  [[0, 0, 1, 1, 1, 1], ...stars(105, 8, 1.05, 0.9)],
);

// A smoke ring: blue-green inside, red at the edge, one tiny star in the middle.
sprite(
  "ring",
  90,
  90,
  (x, y) => {
    const r = Math.hypot(x / 0.88, y / 0.76);
    const texture = 0.15 + smooth(0.25, 0.72, fbm(x * 5, y * 5, 61, 4)) * 1.05;
    const band = gauss(r - 0.6, 0.15) * texture;
    const inner = smooth(0.62, 0.15, r) * 0.26;
    const outer = gauss(r - 0.76, 0.12) * texture;
    return light(outer * 0.82 + band * 0.36, band * 0.72 + inner * 0.6 + outer * 0.28, band * 0.72 + inner * 0.82 + outer * 0.2);
  },
  [[0, 0, 0.9, 0.97, 1, 1]],
);

// A round old galaxy firing one long thin jet with bright knots, far from our black hole.
const JET_KNOTS = [0.16, 0.34, 0.5, 0.63, 0.78, 0.92, 1.06, 1.22];
sprite(
  "jet",
  210,
  120,
  (x, y) => {
    const dx = x + 0.98;
    const dy = y - 0.28;
    const r = Math.hypot(dx, dy / 0.86);
    const halo = Math.exp(-r * 4.3) * 0.82 + gauss(r, 0.1) * 0.75;
    const jetX = Math.cos(-0.3);
    const jetY = Math.sin(-0.3);
    const along = dx * jetX + dy * jetY;
    const across = Math.abs(-dx * jetY + dy * jetX);
    const jet = along > 0 ? gauss(across, 0.012 + along * 0.018) * smooth(1.55, 0.25, along) * 0.72 : 0;
    let knots = 0;
    for (const k of JET_KNOTS) knots += gauss(Math.hypot(along - k, across), 0.028) * (1.2 - k * 0.45);
    return light(
      halo * 1.05 + jet * 0.62 + knots * 0.8,
      halo * 0.82 + jet * 0.82 + knots * 0.92,
      halo * 0.55 + jet * 1.1 + knots * 1.05,
    );
  },
  (() => {
    // A few clusters swarming around the galaxy.
    const random = rng(107);
    return Array.from({ length: 70 }, () => {
      const a = random() * Math.PI * 2;
      const d = random() ** 0.6 * 0.72;
      return [-0.98 + Math.cos(a) * d, 0.28 + Math.sin(a) * d * 0.86, 1, 0.88, 0.68, 0.32 + random() * 0.5];
    });
  })(),
);

// A ball of a few thousand old stars, dense enough in the middle to glow.
sprite(
  "cluster",
  120,
  120,
  (x, y) => {
    const glow = gauss(Math.hypot(x, y), 0.34) * 0.62;
    return light(glow * 1.02, glow * 0.9, glow * 0.68);
  },
  (() => {
    const random = rng(108);
    const colors = [[1, 1, 1], [1, 0.9, 0.72], [1, 0.76, 0.5], [0.76, 0.87, 1]];
    return Array.from({ length: 2300 }, () => {
      const a = random() * Math.PI * 2;
      const d = 0.92 * (random() ** 1.7);
      const [r, g, b] = colors[Math.floor(random() * colors.length)];
      return [Math.cos(a) * d, Math.sin(a) * d, r, g, b, (0.3 + random() * 0.7) * smooth(0.95, 0.25, d)];
    });
  })(),
);

// A bright cloud where stars are being born, spread like wings, with a hot blue heart.
sprite(
  "orion",
  180,
  180,
  (x, y) => {
    const warp = fbm(x * 1.7 + 2, y * 1.7 + 9, 71) - 0.5;
    const u = x + warp * 0.7;
    const v = y + warp * 0.55;
    const angle = Math.atan2(v, u);
    const reach = 0.56 + 0.3 * Math.cos(angle * 2 + 0.75) + (fbm(Math.cos(angle) * 2 + 4, Math.sin(angle) * 2 + 4, 72) - 0.5) * 0.56;
    const r = Math.hypot(u, v);
    const body = smooth(reach, reach * 0.22, r);
    const detail = smooth(0.24, 0.78, fbm(x * 3.6, y * 3.6, 73));
    const threads = smooth(0.74, 0.92, ridged(x * 3, y * 3, 74, 3)) * body;
    const bay = smooth(0.58, 0.76, fbm(x * 2.2 + 12, y * 2.2, 75)) * smooth(0.12, 0.42, r);
    const glow = body * (0.28 + detail * 0.82) * (1 - bay * 0.92);
    const heart = gauss(r, 0.27);
    return light(
      glow * 1.05 + threads * 0.62 + heart * 0.42,
      glow * 0.32 + threads * 0.3 + heart * 0.88,
      glow * 0.62 + threads * 0.42 + heart * 0.96,
    );
  },
  [
    [-0.035, 0, 1, 1, 1, 1],
    [0.04, -0.035, 1, 1, 1, 1],
    [0.025, 0.05, 0.8, 0.92, 1, 1],
    [-0.04, 0.05, 0.8, 0.92, 1, 1],
    ...stars(109, 22, 0.95, 0.95),
  ],
);

// A dark, horse-shaped cloud against a wall of glowing red gas.
const HORSE = [
  [-0.04, 1.1], [-0.02, 0.62], [-0.1, 0.38], [-0.2, 0.25], [-0.34, 0.22], [-0.52, 0.28], [-0.66, 0.26], [-0.72, 0.16],
  [-0.64, 0.04], [-0.52, -0.1], [-0.4, -0.24], [-0.3, -0.38], [-0.27, -0.56], [-0.2, -0.46], [-0.14, -0.53], [-0.08, -0.42],
  [0.08, -0.32], [0.24, -0.1], [0.34, 0.18], [0.46, 0.46], [0.74, 0.72], [1.05, 1.1],
];
function insideHorse(x, y) {
  let hit = false;
  for (let i = 0, j = HORSE.length - 1; i < HORSE.length; j = i++) {
    const [xi, yi] = HORSE[i];
    const [xj, yj] = HORSE[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
sprite(
  "horsehead",
  190,
  160,
  (x, y) => {
    const streaks = fbm(x * 1.6, y * 5 + 2, 81);
    const glowWall = smooth(1, 0.28, Math.hypot(x / 1.12, (y + 0.1) / 0.88));
    const gas = glowWall * (0.05 + smooth(0.22, 0.78, streaks) * 1.05);
    const back = light(gas * 1.02, gas * 0.2, gas * 0.28);
    const wobbleX = (fbm(x * 7, y * 7, 82, 3) - 0.5) * 0.1;
    const wobbleY = (fbm(x * 7 + 5, y * 7, 83, 3) - 0.5) * 0.1;
    const inHorse = insideHorse(x + wobbleX, y + wobbleY);
    const near =
      insideHorse(x + wobbleX + 0.035, y + wobbleY) !== inHorse ||
      insideHorse(x + wobbleX - 0.035, y + wobbleY) !== inHorse ||
      insideHorse(x + wobbleX, y + wobbleY - 0.035) !== inHorse;
    if (!inHorse) {
      const rim = near ? 0.32 * glowWall : 0;
      return light(back[0] * back[3] + rim, back[1] * back[3] + rim * 0.55, back[2] * back[3] + rim * 0.45);
    }
    const base = smooth(0.95, 0.5, y);
    const bottom = smooth(1.02, 0.72, y);
    return over([0.045, 0.025, 0.07, (0.5 + base * 0.48) * bottom * smooth(1.1, 0.5, Math.abs(x))], back);
  },
  stars(110, 16, 1.15, 0.9),
);
