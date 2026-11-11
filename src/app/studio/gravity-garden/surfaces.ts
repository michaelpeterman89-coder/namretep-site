// Procedural planet surfaces: every texture is generated from noise, no image
// files. Plain TypeScript (no DOM, no three.js), so it runs in a Web Worker
// and in tests.
//
// Noise is sampled on the sphere itself (not the flat map), so there's no seam
// where the map wraps and the poles don't pinch.

export const LOOKS = ["earth", "mars", "lava", "ice", "gas"] as const;
export type Look = (typeof LOOKS)[number];

export type Surface = {
  width: number;
  height: number;
  /** sRGB colour, RGBA. */
  color: Uint8Array;
  /** Height for bump mapping (grey, RGBA). */
  bump: Uint8Array;
  /** Roughness in the green channel (three.js reads G), RGBA. */
  roughness: Uint8Array;
  /** Glow (lava cracks), RGBA, or null. */
  emissive: Uint8Array | null;
  /** Cloud cover in all channels (used as an alpha map), RGBA, or null. */
  clouds: Uint8Array | null;
};

// ---------- Noise ----------

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 3D gradient noise in roughly -1..1, seeded. */
export function makeNoise(seed: number) {
  const random = rng(seed);
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const GX = [1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0];
  const GY = [1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1];
  const GZ = [0, 0, 0, 0, 1, 1, -1, -1, 1, 1, -1, -1];
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h: number, x: number, y: number, z: number) => {
    const g = h % 12;
    return GX[g] * x + GY[g] * y + GZ[g] * z;
  };

  return function noise(x: number, y: number, z: number) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const X = xi & 255;
    const Y = yi & 255;
    const Z = zi & 255;
    x -= xi;
    y -= yi;
    z -= zi;
    const u = fade(x);
    const v = fade(y);
    const w = fade(z);
    const A = perm[X] + Y;
    const AA = perm[A] + Z;
    const AB = perm[A + 1] + Z;
    const B = perm[X + 1] + Y;
    const BA = perm[B] + Z;
    const BB = perm[B + 1] + Z;
    const lerp = (t: number, a: number, b: number) => a + t * (b - a);
    return lerp(
      w,
      lerp(
        v,
        lerp(u, grad(perm[AA], x, y, z), grad(perm[BA], x - 1, y, z)),
        lerp(u, grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z)),
      ),
      lerp(
        v,
        lerp(u, grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1)),
        lerp(u, grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1)),
      ),
    );
  };
}

type Noise = ReturnType<typeof makeNoise>;

/** Layered noise: big shapes plus finer and finer detail. Roughly -1..1. */
function fbm(n: Noise, x: number, y: number, z: number, octaves: number, lacunarity = 2.03, gain = 0.5) {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * n(x * f + o * 17.1, y * f - o * 9.7, z * f + o * 3.3);
    f *= lacunarity;
    amp *= gain;
  }
  return sum * 1.6;
}

/** Sharp ridges (mountain chains, cracks). 0..1, peaks near 1. */
function ridged(n: Noise, x: number, y: number, z: number, octaves: number) {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    const r = 1 - Math.abs(n(x * f + o * 5.3, y * f + o * 1.7, z * f - o * 8.9));
    sum += amp * r * r;
    f *= 2.1;
    amp *= 0.5;
  }
  return sum;
}

// ---------- Colour helpers ----------

type RGB = [number, number, number];
const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Picks a colour along a ramp of [position, colour] stops. */
function ramp(stops: readonly (readonly [number, RGB])[], t: number): RGB {
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [p0, c0] = stops[i - 1];
      const [p1, c1] = stops[i];
      return mix(c0, c1, (t - p0) / (p1 - p0));
    }
  }
  return stops[stops.length - 1][1];
}

// ---------- The looks ----------

type Texel = { color: RGB; height: number; rough: number; glow?: RGB; cloud?: number };
type Shader = (x: number, y: number, z: number, lat: number) => Texel;

const OCEAN = [
  [0, hex("#04122e")],
  [0.7, hex("#0a2f5c")],
  [1, hex("#1d6a8a")],
] as const;
const LAND = [
  [0, hex("#c2b280")],
  [0.06, hex("#4f7a2c")],
  [0.35, hex("#2f5a22")],
  [0.6, hex("#6b5a3e")],
  [0.85, hex("#8a8278")],
  [0.97, hex("#f2f4f7")],
] as const;
const DESERT = hex("#c8a165");

function earth(n: Noise, n2: Noise): Shader {
  return (x, y, z, lat) => {
    // Domain warp makes coastlines less blobby.
    const wx = x + 0.35 * n(x * 1.5, y * 1.5, z * 1.5);
    const wz = z + 0.35 * n(z * 1.5 + 4, x * 1.5, y * 1.5);
    const h = fbm(n, wx * 1.7, y * 1.7, wz * 1.7, 7) + 0.08;
    const polar = smooth(0.8, 0.9, Math.abs(lat) / (Math.PI / 2) + 0.06 * n(x * 6, y * 6, z * 6));
    let color: RGB;
    let rough: number;
    let height: number;
    if (h < 0) {
      color = ramp(OCEAN, clamp01(1 + h * 2.2));
      rough = 0.32;
      height = 0.35;
    } else {
      const mountain = ridged(n2, x * 3, y * 3, z * 3, 5);
      const elev = clamp01(h * 1.5 + mountain * 0.22);
      color = ramp(LAND, elev);
      // Deserts in dry belts around 20–30° from the equator.
      const dry = smooth(0.3, 0.7, n2(x * 2.2, y * 2.2, z * 2.2) + 0.45 * Math.exp(-(((Math.abs(lat) - 0.42) / 0.14) ** 2)));
      if (elev < 0.6) color = mix(color, DESERT, dry * 0.7 * (1 - elev / 0.6));
      rough = 0.88;
      height = 0.45 + elev * 0.55;
    }
    if (polar > 0) {
      color = mix(color, hex("#eef3f8"), polar);
      rough = rough + (0.6 - rough) * polar;
    }
    // Clouds: stretched along latitude like real weather bands, with swirls.
    const c = fbm(n2, x * 2.6 + 11, y * 5.2, z * 2.6, 6) + 0.25 * Math.sin(lat * 9 + 3 * n(x * 2, y * 2, z * 2));
    const cloud = smooth(0.05, 0.55, c);
    return { color, height, rough, cloud };
  };
}

function mars(n: Noise, n2: Noise): Shader {
  return (x, y, z, lat) => {
    const h = fbm(n, x * 1.8, y * 1.8, z * 1.8, 7);
    const dark = smooth(0.0, 0.5, fbm(n2, x * 1.3, y * 1.3, z * 1.3, 4));
    let color = mix(hex("#c1683a"), hex("#e0a070"), smooth(-0.6, 0.8, h));
    color = mix(color, hex("#5e3524"), dark * 0.7);
    // Small craters: pockmarks where high-frequency noise peaks.
    const crater = smooth(0.62, 0.8, ridged(n2, x * 9, y * 9, z * 9, 2));
    const polar = smooth(0.84, 0.93, Math.abs(lat) / (Math.PI / 2) + 0.04 * n(x * 8, y * 8, z * 8));
    color = mix(color, hex("#f4ede4"), polar);
    return { color, height: clamp01(0.5 + h * 0.4 - crater * 0.2), rough: 0.95 };
  };
}

function lava(n: Noise, n2: Noise): Shader {
  return (x, y, z) => {
    const crust = fbm(n, x * 2.2, y * 2.2, z * 2.2, 6);
    const cracks = ridged(n2, x * 3.2, y * 3.2, z * 3.2, 5);
    const hot = smooth(0.62, 0.86, cracks + crust * 0.15);
    const color = mix(mix(hex("#1a1210"), hex("#3a2a24"), smooth(-0.5, 0.6, crust)), hex("#4a1a08"), hot);
    const glow = mix(hex("#ff3a00"), hex("#ffd060"), smooth(0.8, 1, cracks)).map((c) => c * hot) as RGB;
    return { color, height: clamp01(0.6 + crust * 0.3 - hot * 0.4), rough: 0.9 - hot * 0.3, glow };
  };
}

function ice(n: Noise, n2: Noise): Shader {
  return (x, y, z) => {
    const base = fbm(n, x * 2, y * 2, z * 2, 6);
    // Long criss-crossing cracks, stained brown like Europa's: two families at different scales.
    const big = 1 - Math.abs(n2(x * 2.2, y * 2.2, z * 2.2) + 0.15 * n(x * 9, y * 9, z * 9));
    const small = 1 - Math.abs(n2(x * 5.5 + 7, y * 5.5, z * 5.5 - 3));
    const lines = Math.max(smooth(0.955, 0.99, big), smooth(0.965, 0.995, small) * 0.7);
    const stain = smooth(0.85, 0.97, big) * 0.35;
    let color = mix(hex("#e6eef4"), hex("#9fbcd2"), smooth(-0.6, 0.7, base));
    color = mix(color, hex("#b08a6a"), stain);
    color = mix(color, hex("#7a4a30"), lines * 0.6);
    return { color, height: clamp01(0.55 + base * 0.2 - lines * 0.3), rough: 0.35 + lines * 0.4 };
  };
}

function gas(n: Noise, n2: Noise, random: () => number): Shader {
  const palettes = [
    // Jupiter-ish creams and browns.
    [hex("#e8d8b8"), hex("#c49a6c"), hex("#f2e6cf"), hex("#8f6a4a"), hex("#d9b48a"), hex("#efe1c6")],
    // Saturn-ish golds.
    [hex("#f1dfae"), hex("#d8bb7c"), hex("#efe2bf"), hex("#c7a36a"), hex("#e6cf98"), hex("#f6ecd0")],
    // Ice-giant blues.
    [hex("#9fd3e6"), hex("#6aaec9"), hex("#b9e2ee"), hex("#4f8fb0"), hex("#86c2d8"), hex("#c8eaf3")],
  ];
  const pal = palettes[Math.floor(random() * palettes.length)];
  const stormLon = random() * Math.PI * 2;
  const stormLat = -0.38;
  const sx = Math.cos(stormLat) * Math.cos(stormLon);
  const sy = Math.sin(stormLat);
  const sz = Math.cos(stormLat) * Math.sin(stormLon);
  return (x, y, z, lat) => {
    // Swirl around the storm: rotate the sample point near its centre.
    const d = Math.hypot(x - sx, (y - sy) * 1.9, z - sz);
    const storm = Math.exp(-((d / 0.22) ** 2));
    const turb = fbm(n, x * 3, y * 10, z * 3, 5) * 0.45;
    // Several bands per hemisphere, wobbling where the turbulence pushes them.
    const wave = Math.sin(lat * 7.5 + turb * 2.2) * 0.5 + 0.5;
    const band = (wave * 0.65 + (Math.sin(lat * 17 + turb) * 0.5 + 0.5) * 0.35) * (pal.length - 1) + storm * 2 * Math.sin(d * 34);
    const i = Math.max(0, Math.min(pal.length - 2, Math.floor(band)));
    let color = mix(pal[i], pal[i + 1], band - i);
    color = mix(color, hex("#b5533a"), storm * 0.8);
    color = mix(color, mix(color, hex("#ffffff"), 0.4), smooth(0.4, 0.8, n2(x * 12, y * 30, z * 12)) * 0.3);
    return { color, height: 0.5, rough: 0.8 };
  };
}

/** Builds a planet surface map. `width` × `width/2`, equirectangular, row 0 = south pole. */
export function generateSurface(look: Look, seed: number, width: number): Surface {
  const height = width / 2;
  const random = rng(seed * 7919 + 1);
  const n = makeNoise(seed);
  const n2 = makeNoise(seed + 101);
  const shader: Shader =
    look === "earth" ? earth(n, n2) : look === "mars" ? mars(n, n2) : look === "lava" ? lava(n, n2) : look === "ice" ? ice(n, n2) : gas(n, n2, random);

  const size = width * height * 4;
  const color = new Uint8Array(size);
  const bump = new Uint8Array(size);
  const roughness = new Uint8Array(size);
  const emissive = look === "lava" ? new Uint8Array(size) : null;
  const clouds = look === "earth" ? new Uint8Array(size) : null;

  for (let row = 0; row < height; row++) {
    const lat = ((row + 0.5) / height - 0.5) * Math.PI;
    const cl = Math.cos(lat);
    const y = Math.sin(lat);
    for (let col = 0; col < width; col++) {
      // Matches three.js SphereGeometry: u=0 at -x, going round through +z... see engine.
      const lon = (col / width) * Math.PI * 2;
      const x = -Math.cos(lon) * cl;
      const z = Math.sin(lon) * cl;
      const t = shader(x, y, z, lat);
      const o = (row * width + col) * 4;
      color[o] = t.color[0];
      color[o + 1] = t.color[1];
      color[o + 2] = t.color[2];
      color[o + 3] = 255;
      const h = Math.round(clamp01(t.height) * 255);
      bump[o] = bump[o + 1] = bump[o + 2] = h;
      bump[o + 3] = 255;
      roughness[o + 1] = Math.round(clamp01(t.rough) * 255);
      roughness[o + 3] = 255;
      if (emissive && t.glow) {
        emissive[o] = t.glow[0];
        emissive[o + 1] = t.glow[1];
        emissive[o + 2] = t.glow[2];
        emissive[o + 3] = 255;
      }
      if (clouds && t.cloud !== undefined) {
        const c = Math.round(clamp01(t.cloud) * 255);
        clouds[o] = clouds[o + 1] = clouds[o + 2] = clouds[o + 3] = c;
      }
    }
  }
  return { width, height, color, bump, roughness, emissive, clouds };
}
