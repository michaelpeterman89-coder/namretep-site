"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useFrameLoop, useReducedMotion } from "../_kit/motion";
import { GrayScott, PRESETS, colorRamp, paint } from "./gray-scott";

/** Simulation ticks per frame at 60fps. More = faster growth, more work. */
const STEPS_PER_FRAME = 10;
/** Ticks to pre-grow a still pattern when motion is reduced. */
const STILL_STEPS = 2400;
/** Brush radius, in grid cells. */
const BRUSH = 3;

/** Grid size for the space available: chunky pixels, capped so phones keep up. */
function gridSize(cssWidth: number) {
  const cell = cssWidth < 640 ? 3 : 4;
  const width = Math.max(60, Math.min(240, Math.round(cssWidth / cell)));
  const height = Math.round(width * (cssWidth < 640 ? 1 : 0.75));
  return { width, height };
}

function seedDish(sim: GrayScott) {
  sim.clear();
  sim.scatter(Math.round((sim.width * sim.height) / 2500) + 3, 4);
}

export function ReactionDiffusion() {
  const reduced = useReducedMotion();
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const sim = useRef<GrayScott | null>(null);
  const pixels = useRef<ImageData | null>(null);
  const brush = useRef<{ x: number; y: number } | null>(null);

  const [presetKey, setPresetKey] = useState(PRESETS[0].key);
  const preset = PRESETS.find((p) => p.key === presetKey)!;
  const ramp = useRef(colorRamp(preset.colors));
  // Plays unless the device asks for less motion, until the player presses Play or Pause.
  const [choice, setChoice] = useState<boolean | null>(null);
  const playing = choice ?? !reduced;
  const [growing, setGrowing] = useState(false);
  const growJob = useRef(0);

  const draw = useCallback(() => {
    const s = sim.current;
    const img = pixels.current;
    const ctx = canvas.current?.getContext("2d");
    if (!s || !img || !ctx) return;
    paint(s, ramp.current, img.data);
    ctx.putImageData(img, 0, 0);
  }, []);

  /** Grows a pattern without animating it (for reduced motion), then shows the result. */
  const growStill = useCallback(
    (feed: number, kill: number) => {
      const s = sim.current;
      if (!s) return;
      const job = ++growJob.current;
      let done = 0;
      setGrowing(true);
      const chunk = () => {
        if (job !== growJob.current) return;
        s.step(feed, kill, 120);
        done += 120;
        if (done < STILL_STEPS) setTimeout(chunk, 0);
        else {
          setGrowing(false);
          draw();
        }
      };
      setTimeout(chunk, 0);
    },
    [draw],
  );

  // Build the grid once, sized to the space on screen.
  useEffect(() => {
    const el = canvas.current!;
    const { width, height } = gridSize(wrap.current!.clientWidth);
    el.width = width;
    el.height = height;
    sim.current = new GrayScott(width, height);
    pixels.current = el.getContext("2d")!.createImageData(width, height);
    seedDish(sim.current);
    draw();
    // With less motion it starts paused, so grow a still picture to look at.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) growStill(PRESETS[0].feed, PRESETS[0].kill);
    const jobs = growJob;
    return () => {
      jobs.current++;
      sim.current = null;
    };
  }, [draw, growStill]);

  useFrameLoop((dt) => {
    const s = sim.current;
    if (!s) return;
    s.step(preset.feed, preset.kill, Math.min(20, Math.round(STEPS_PER_FRAME * dt * 60)));
    draw();
  }, playing);

  function choosePreset(key: string) {
    const next = PRESETS.find((p) => p.key === key)!;
    setPresetKey(key);
    ramp.current = colorRamp(next.colors);
    draw();
    if (!playing && reduced) growStill(next.feed, next.kill);
  }

  function reset() {
    if (!sim.current) return;
    seedDish(sim.current);
    draw();
    if (!playing && reduced) growStill(preset.feed, preset.kill);
  }

  // ---------- Painting with a finger or mouse ----------

  function toCell(e: React.PointerEvent) {
    const r = canvas.current!.getBoundingClientRect();
    const s = sim.current!;
    return { x: ((e.clientX - r.left) / r.width) * s.width, y: ((e.clientY - r.top) / r.height) * s.height };
  }

  function strokeTo(to: { x: number; y: number }) {
    const s = sim.current;
    if (!s) return;
    const from = brush.current ?? to;
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (BRUSH / 2)));
    for (let i = 1; i <= steps; i++) {
      s.drop(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps, BRUSH);
    }
    brush.current = to;
    if (!playing) draw();
  }

  return (
    <div className="flex flex-col gap-4">
      <div ref={wrap} className="pixel-panel relative overflow-hidden p-1.5">
        <canvas
          ref={canvas}
          aria-label={`Reaction-diffusion simulation, ${preset.name} pattern. Drag on it to add chemical B.`}
          role="img"
          className="block aspect-square w-full cursor-crosshair touch-none rounded-sm [image-rendering:pixelated] sm:aspect-[4/3]"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            brush.current = null;
            strokeTo(toCell(e));
          }}
          onPointerMove={(e) => {
            if (brush.current) strokeTo(toCell(e));
          }}
          onPointerUp={() => (brush.current = null)}
          onPointerCancel={() => (brush.current = null)}
        />
        {growing && (
          <p className="absolute inset-x-0 bottom-4 text-center font-display text-[0.6rem] text-starlight/80">
            Growing…
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Pattern" className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={p.key === presetKey}
              onClick={() => choosePreset(p.key)}
              className={`min-h-11 rounded-sm border-2 px-3 font-display text-[0.6rem] ${
                p.key === presetKey
                  ? "border-neon-lime bg-neon-lime/15 text-neon-lime"
                  : "border-space-700 text-starlight/80 hover:border-neon-lime/60"
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div className="flex gap-2 sm:ml-auto">
          <button
            type="button"
            onClick={() => {
              growJob.current++; // stop any still picture still growing
              setGrowing(false);
              setChoice(!playing);
            }}
            className="min-h-11 rounded-sm border-2 border-neon-cyan px-3 font-display text-[0.6rem] text-neon-cyan hover:bg-neon-cyan/10"
          >
            {playing ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            onClick={reset}
            className="min-h-11 rounded-sm border-2 border-neon-magenta px-3 font-display text-[0.6rem] text-neon-magenta hover:bg-neon-magenta/10"
          >
            Reset
          </button>
        </div>
      </div>

      <p className="text-sm text-starlight/60">
        Drag on the dish to drop in more of chemical B. Switch patterns while it runs to watch one turn into another.
        {reduced && " Your device asks for less motion, so it starts paused; press Play to watch it grow."}
      </p>
    </div>
  );
}
