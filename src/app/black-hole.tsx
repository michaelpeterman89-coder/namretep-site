"use client";

import { useEffect, useRef } from "react";

// The home page's black hole. Stars are real particles pulled in by
// inverse-square gravity, so nearby stars speed up and far ones barely move.
// Light bends around the hole too (gravitational lensing): each star is drawn
// where it would appear, pushed out toward the glowing ring, with a faint
// second image on the far side once it gets close. Every so often it fires a
// pair of jets along its spin axis, straight up and down from the flat disk.

/** How strongly the hole pulls, for a hole with a 40px shadow (px³/s²). */
const PULL = 9000;
const STAR_COLORS = ["#ffffff", "#ffffff", "#ece8ff", "#bdf7ff", "#ffd6ec", "#ffcf3e"];

/** Seconds from page load to the first jets, picked at random in this range. */
const JET_FIRST = [6, 10];
/** Seconds from the end of one burst to the next, picked at random in this range. */
const JET_GAP = [20, 35];
/** How long one burst lasts, seconds. */
const JET_LIFE = 7;
/** How far the jets reach from the centre, in shadow radii. */
const JET_LENGTH = 7;
/** How bright the jets get, 0 to 1. */
const JET_BRIGHTNESS = 0.7;
/** Bright knots per jet. */
const JET_KNOTS = 5;

type Star = { x: number; y: number; vx: number; vy: number; size: number; color: string; age: number };
type Speck = { angle: number; radius: number; speed: number; light: number };
type Knot = { delay: number; speed: number; drift: number; size: number; light: number };
type Jets = { age: number; up: Knot[]; down: Knot[] };

function between([min, max]: number[]) {
  return min + Math.random() * (max - min);
}

function newKnots(): Knot[] {
  return Array.from({ length: JET_KNOTS }, () => ({
    delay: Math.random() * (JET_LIFE * 0.5),
    speed: between([0.18, 0.28]),
    drift: between([-0.06, 0.06]),
    size: between([0.035, 0.07]),
    light: between([0.6, 1]),
  }));
}

export function BlackHole() {
  const spot = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext("2d")!;
    // Next.js keeps a page you've left in the DOM, just hidden, so this is set
    // while the hole is running rather than whenever its canvas exists.
    document.documentElement.classList.add("black-hole-page");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let shadow = 40; // radius of the black shadow, px
    let stars: Star[] = [];
    const specks: Speck[] = Array.from({ length: 70 }, () => ({
      angle: Math.random() * Math.PI * 2,
      radius: 1.35 + Math.random() * 1.3,
      speed: 0,
      light: 0.4 + Math.random() * 0.6,
    }));
    // Inner disk matter orbits faster (Kepler: speed ∝ r^-1.5).
    for (const s of specks) s.speed = 0.9 * s.radius ** -1.5;
    let jets: Jets | null = null;
    let jetWait = between(JET_FIRST);

    /** Where the hole's centre is on screen, and the area stars live in, relative to it. */
    function hole() {
      const r = spot.current!.getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    }
    function field() {
      const { cx, cy } = hole();
      const pageTop = cy + window.scrollY;
      const pageHeight = Math.max(document.documentElement.scrollHeight, height);
      return { left: -cx - 40, right: width - cx + 40, top: -pageTop - 40, bottom: pageHeight - pageTop + 40 };
    }

    function newStar(f: ReturnType<typeof field>, fresh: boolean): Star {
      // Anywhere in the field, but not already falling in.
      let x = 0;
      let y = 0;
      do {
        x = f.left + Math.random() * (f.right - f.left);
        y = f.top + Math.random() * (f.bottom - f.top);
      } while (Math.hypot(x, y) < shadow * 3.5);
      // A slight sideways drift, so stars curve in rather than dropping straight.
      const r = Math.hypot(x, y);
      const swirl = 0.25 * Math.sqrt((PULL * (shadow / 40) ** 3) / r);
      return {
        x,
        y,
        vx: (-y / r) * swirl,
        vy: (x / r) * swirl,
        size: Math.random() < 0.15 ? 2 : 1,
        color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
        age: fresh ? 0 : 10,
      };
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      el.width = Math.round(width * dpr);
      el.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      shadow = Math.max(26, Math.min(48, spot.current!.offsetHeight * 0.2));
      const f = field();
      const count = Math.min(450, Math.round(((f.right - f.left) * (f.bottom - f.top)) / 5000));
      stars = Array.from({ length: count }, () => newStar(f, false));
    }

    function step(dt: number) {
      const pull = PULL * (shadow / 40) ** 3;
      const soft = (shadow * 0.5) ** 2;
      let f: ReturnType<typeof field> | null = null;
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const r2 = s.x * s.x + s.y * s.y;
        const r = Math.sqrt(r2);
        // Newton: a = GM / r², pointed at the hole.
        const a = pull / (r2 + soft);
        s.vx -= (a * s.x * dt) / r;
        s.vy -= (a * s.y * dt) / r;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.age += dt;
        if (r < shadow * 0.9) stars[i] = newStar((f ??= field()), true);
      }
      for (const k of specks) k.angle += k.speed * dt;
      if (jets) {
        jets.age += dt;
        if (jets.age >= JET_LIFE) {
          jets = null;
          jetWait = between(JET_GAP);
        }
      } else {
        jetWait -= dt;
        if (jetWait <= 0) jets = { age: 0, up: newKnots(), down: newKnots() };
      }
    }

    function drawStars(cx: number, cy: number) {
      const einstein = shadow * 1.6;
      for (const s of stars) {
        const r = Math.hypot(s.x, s.y) || 0.001;
        const u = r / einstein;
        const root = Math.sqrt(u * u + 4);
        const total = (u * u + 2) / (u * root);
        // Fade in when born, and dim as it slips toward the edge of no return.
        const fade = Math.min(1, s.age / 1.5) * Math.min(1, Math.max(0, (r - shadow * 0.9) / (shadow * 1.2)));
        if (fade <= 0) continue;
        const images = [
          { scale: (u + root) / 2, bright: (total + 1) / 2 },
          { scale: (u - root) / 2, bright: (total - 1) / 2 },
        ];
        for (const { scale, bright } of images) {
          const k = (scale * einstein) / r;
          const x = cx + s.x * k;
          const y = cy + s.y * k;
          if (x < -4 || y < -4 || x > width + 4 || y > height + 4) continue;
          const alpha = Math.min(1, bright) * fade;
          if (alpha < 0.04) continue;
          ctx.globalAlpha = alpha;
          ctx.fillStyle = s.color;
          ctx.strokeStyle = s.color;
          const speed = Math.hypot(s.vx, s.vy);
          if (speed > 18 && scale > 0) {
            // Fast stars smear into short streaks along their path.
            ctx.lineWidth = s.size;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - s.vx * 0.12 * k, y - s.vy * 0.12 * k);
            ctx.stroke();
          } else {
            const size = s.size * Math.min(2, Math.sqrt(bright));
            ctx.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), size, size);
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    /** One tapered stream, up (dir -1) or down (dir 1), wider as it gets further from the hole. */
    function drawStream(cx: number, cy: number, dir: number, reach: number, base: number, tip: number) {
      ctx.beginPath();
      ctx.moveTo(cx - base, cy);
      ctx.lineTo(cx - tip, cy + dir * reach);
      ctx.lineTo(cx + tip, cy + dir * reach);
      ctx.lineTo(cx + base, cy);
      ctx.closePath();
      ctx.fill();
    }

    function drawJet(cx: number, cy: number, dir: number, knots: Knot[], age: number, bright: number) {
      const length = shadow * JET_LENGTH;
      // Shoots out fast then eases off, and fades out once it's reached its full length.
      const grown = Math.min(1, age / 3);
      const shot = 1 - (1 - grown) ** 2;
      const reach = length * shot;
      const fade = Math.min(1, age / 1.2, (JET_LIFE - age) / 2.5) * bright;
      if (reach <= 0 || fade <= 0) return;

      const glow = ctx.createLinearGradient(0, cy, 0, cy + dir * reach);
      glow.addColorStop(0, "rgb(140 190 255 / 0.5)");
      glow.addColorStop(0.5, "rgb(110 165 255 / 0.2)");
      glow.addColorStop(1, "rgb(100 150 255 / 0)");
      ctx.globalAlpha = fade;
      ctx.fillStyle = glow;
      drawStream(cx, cy, dir, reach, shadow * 0.09, shadow * 0.2);

      const core = ctx.createLinearGradient(0, cy, 0, cy + dir * reach);
      core.addColorStop(0, "rgb(240 248 255 / 1)");
      core.addColorStop(0.45, "rgb(190 222 255 / 0.55)");
      core.addColorStop(1, "rgb(160 205 255 / 0)");
      ctx.fillStyle = core;
      drawStream(cx, cy, dir, reach, Math.max(0.6, shadow * 0.025), Math.max(0.8, shadow * 0.04));

      // Knots: brighter clumps travelling out along the stream, dimming as they go.
      for (const k of knots) {
        const at = 0.12 + k.speed * (age - k.delay);
        if (age < k.delay || at > shot) continue;
        const x = cx + k.drift * shadow * at;
        const y = cy + dir * length * at;
        const size = Math.max(1, k.size * shadow);
        ctx.globalAlpha = fade * k.light * (1 - at) * 0.3;
        ctx.fillStyle = "#a8ccff";
        ctx.beginPath();
        ctx.arc(x, y, size * 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = fade * k.light * (1 - at);
        ctx.fillStyle = "#f4f9ff";
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function drawJets(cx: number, cy: number) {
      const length = shadow * JET_LENGTH;
      if (!jets || cy < -length || cy > height + length) return;
      // We look slightly down on the disk, so the upper jet leans toward us and looks brighter.
      drawJet(cx, cy, -1, jets.up, jets.age, JET_BRIGHTNESS);
      drawJet(cx, cy, 1, jets.down, jets.age, JET_BRIGHTNESS * 0.75);
    }

    /** The disk seen nearly edge-on: half of it ("back" or "front") as a band of glowing matter. */
    function drawDisk(cx: number, cy: number, half: "back" | "front") {
      const flat = 0.16;
      // Brighter on the left, where the gas is swinging toward us (Doppler beaming).
      const band = ctx.createLinearGradient(cx - shadow * 3, 0, cx + shadow * 3, 0);
      band.addColorStop(0, "rgb(255 140 40 / 0)");
      band.addColorStop(0.15, "rgb(255 170 70 / 0.8)");
      band.addColorStop(0.35, "rgb(255 246 220 / 1)");
      band.addColorStop(0.65, "rgb(255 214 140 / 1)");
      band.addColorStop(0.85, "rgb(255 150 50 / 0.7)");
      band.addColorStop(1, "rgb(255 120 40 / 0)");
      const from = half === "back" ? Math.PI : 0;
      ctx.fillStyle = band;
      ctx.beginPath();
      ctx.ellipse(cx, cy, shadow * 3, shadow * 3 * flat, 0, from, from + Math.PI);
      ctx.ellipse(cx, cy, shadow * 1.12, shadow * 1.12 * flat * 0.4, 0, from + Math.PI, from, true);
      ctx.fill();
      // Clumps of hot gas orbiting in the disk.
      for (const k of specks) {
        const sin = Math.sin(k.angle);
        if ((sin < 0) !== (half === "back")) continue;
        const x = cx + Math.cos(k.angle) * shadow * k.radius * 1.1;
        const y = cy + sin * shadow * k.radius * 1.1 * flat * 0.7;
        ctx.globalAlpha = k.light * (0.55 + 0.45 * Math.abs(Math.cos(k.angle)));
        ctx.fillStyle = "#fff4d6";
        ctx.fillRect(Math.round(x - 1.5), Math.round(y - 1), 3, 2);
      }
      ctx.globalAlpha = 1;
    }

    function drawHole(cx: number, cy: number) {
      if (cy < -shadow * 4 || cy > height + shadow * 4) return;
      // Warm glow around everything.
      const glow = ctx.createRadialGradient(cx, cy, shadow, cx, cy, shadow * 4);
      glow.addColorStop(0, "rgb(255 170 70 / 0.35)");
      glow.addColorStop(0.4, "rgb(255 120 60 / 0.1)");
      glow.addColorStop(1, "rgb(255 100 60 / 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(cx - shadow * 4, cy - shadow * 4, shadow * 8, shadow * 8);

      // The far side of the disk, bent by gravity up over the top and under the bottom.
      const halo = ctx.createRadialGradient(cx, cy, shadow, cx, cy, shadow * 1.6);
      halo.addColorStop(0, "rgb(255 250 235 / 1)");
      halo.addColorStop(0.12, "rgb(255 232 170 / 1)");
      halo.addColorStop(0.3, "rgb(255 180 80 / 0.75)");
      halo.addColorStop(0.65, "rgb(255 130 50 / 0.18)");
      halo.addColorStop(1, "rgb(255 120 40 / 0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, shadow * 1.6, 0, Math.PI * 2);
      ctx.fill();

      drawDisk(cx, cy, "back");

      // The shadow: nothing comes back out.
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(cx, cy, shadow, 0, Math.PI * 2);
      ctx.fill();
      // Light that just skims the edge (the photon ring).
      ctx.strokeStyle = "rgb(255 248 230 / 0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, shadow + 1, 0, Math.PI * 2);
      ctx.stroke();

      drawDisk(cx, cy, "front");
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);
      const { cx, cy } = hole();
      drawStars(cx, cy);
      drawJets(cx, cy);
      drawHole(cx, cy);
    }

    resize();
    let frame = 0;
    let last = performance.now();
    function tick(now: number) {
      // Cap the step so a background tab doesn't fling stars when it comes back.
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      step(dt);
      draw();
      frame = requestAnimationFrame(tick);
    }
    function start() {
      cancelAnimationFrame(frame);
      if (still.matches) {
        jets = null;
        draw();
      } else {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    }
    const redraw = () => still.matches && draw();
    const onResize = () => {
      resize();
      draw();
    };
    start();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", redraw, { passive: true });
    still.addEventListener("change", start);
    return () => {
      document.documentElement.classList.remove("black-hole-page");
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", redraw);
      still.removeEventListener("change", start);
    };
  }, []);

  return (
    <>
      <div ref={spot} aria-hidden className="h-48 w-full sm:h-60" />
      <canvas ref={canvas} aria-hidden className="black-hole-sky pointer-events-none fixed inset-0 -z-[9] size-full" />
    </>
  );
}
