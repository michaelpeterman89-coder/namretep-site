"use client";

import { useEffect, useRef, useState } from "react";
import { useFrameLoop, useReducedMotion } from "../_kit/motion";
import type { Engine, Stats } from "./engine";
import milkyWay2k from "./milky-way-2k.jpg";
import milkyWay4k from "./milky-way-4k.jpg";
import { PLANET_TYPES } from "./planet-types";
import { TIER_ORDER, startingTier, type Tier } from "./quality";
import { LOOKS, type Look } from "./surfaces";

const SPEEDS = [0.1, 1, 10, 100, 1000] as const;
const SPEED_LABEL: Record<number, string> = { 0.1: "0.1×", 1: "1×", 10: "10×", 100: "100×", 1000: "1000×" };
const TIER_LABEL: Record<Tier, string> = { high: "High", medium: "Medium", low: "Low" };

function describeTime(years: number) {
  const y = Math.floor(years);
  const d = Math.floor((years - y) * 365.25);
  return `Year ${y + 1}, day ${d + 1}`;
}

function daysPerSecond(speed: number) {
  if (speed < 1) return "1 second = 2.4 hours";
  if (speed === 1) return "1 second = 1 day";
  if (speed < 365) return `1 second = ${speed} days`;
  return `1 second = ${(speed / 365.25).toFixed(1)} years`;
}

type Status = "loading" | "ready" | "failed";

export function GravityGarden() {
  const reduced = useReducedMotion();
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);

  const [status, setStatus] = useState<Status>("loading");
  const [stats, setStats] = useState<Stats | null>(null);
  const [look, setLook] = useState<Look>("earth");
  const [speedChoice, setSpeedChoice] = useState<number | null>(null);
  const speed = speedChoice ?? (reduced ? 1 : 10);
  const [paused, setPaused] = useState(false);
  const [assist, setAssist] = useState(true);
  const [trails, setTrails] = useState(true);
  const [tier, setTier] = useState<Tier | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [hints, setHints] = useState(true);
  const [touch, setTouch] = useState(false);

  // Start the 3D engine. three.js downloads here, on this page only.
  useEffect(() => {
    let cancelled = false;
    let messageTimer: ReturnType<typeof setTimeout> | undefined;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const nav = navigator as Navigator & { deviceMemory?: number };
    const first = startingTier({
      coarsePointer: coarse,
      width: window.innerWidth,
      cores: navigator.hardwareConcurrency || undefined,
      memory: nav.deviceMemory,
    });

    import("./engine")
      .then(({ createEngine }) => {
        if (cancelled || !canvas.current) return;
        engine.current = createEngine({
          canvas: canvas.current,
          tier: first,
          reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
          backdrops: { "4k": milkyWay4k.src, "2k": milkyWay2k.src },
          onStats: setStats,
          onTierChange: setTier,
          onMessage: (text) => {
            setMessage(text);
            clearTimeout(messageTimer);
            messageTimer = setTimeout(() => setMessage(null), 3500);
          },
          onFirstLaunch: () => setTimeout(() => setHints(false), 2500),
        });
        setTouch(coarse);
        setTier(first);
        setStatus("ready");
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setStatus("failed");
      });

    return () => {
      cancelled = true;
      clearTimeout(messageTimer);
      engine.current?.dispose();
      engine.current = null;
    };
  }, []);

  // Keep the engine in step with the buttons.
  useEffect(() => engine.current?.setSpeed(speed), [speed, status]);
  useEffect(() => engine.current?.setPaused(paused), [paused, status]);
  useEffect(() => engine.current?.setLook(look), [look, status]);
  useEffect(() => engine.current?.setAssist(assist), [assist, status]);
  useEffect(() => engine.current?.setTrails(trails), [trails, status]);

  useFrameLoop((dt) => engine.current?.frame(dt), status === "ready");

  function changeSpeed(step: number) {
    const i = SPEEDS.indexOf(speed as (typeof SPEEDS)[number]);
    const next = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, i + step))];
    setSpeedChoice(next);
    setPaused(false);
  }

  function chooseTier(next: Tier) {
    setTier(next);
    engine.current?.setTier(next, true);
  }

  function fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else stage.current?.requestFullscreen?.();
  }

  // Keyboard controls, whenever focus isn't in a text box.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey) return;
      const onButton = el.tagName === "BUTTON";
      const eng = engine.current;
      const k = e.key;
      let handled = true;
      if (k === " " && !onButton) setPaused((p) => !p);
      else if (k === "[" || k === ",") changeSpeed(-1);
      else if (k === "]" || k === ".") changeSpeed(1);
      else if (k >= "1" && k <= "5") setLook(LOOKS[Number(k) - 1]);
      else if (k === "n" || k === "N") eng?.addPlanet();
      else if (k === "a" || k === "A") setAssist((a) => !a);
      else if (k === "t" || k === "T") setTrails((t) => !t);
      else if (k === "f" || k === "F") fullscreen();
      else if (k === "Escape") eng?.cancelDrag();
      else if (k === "Delete") eng?.clear();
      else if (k === "ArrowLeft") eng?.orbit(-0.08, 0);
      else if (k === "ArrowRight") eng?.orbit(0.08, 0);
      else if (k === "ArrowUp") eng?.orbit(0, -0.06);
      else if (k === "ArrowDown") eng?.orbit(0, 0.06);
      else if (k === "+" || k === "=") eng?.zoom(0.85);
      else if (k === "-" || k === "_") eng?.zoom(1.18);
      else handled = false;
      if (handled) e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const button = "min-h-11 rounded-sm border-2 px-3 font-display text-[0.6rem] leading-none";
  const on = "border-neon-lime bg-neon-lime/15 text-neon-lime";
  const off = "border-space-700 text-starlight/80 hover:border-neon-lime/60";

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={stage}
        className="pixel-panel relative h-[68svh] min-h-80 overflow-hidden p-0 sm:h-auto sm:aspect-video sm:max-h-[78vh] [&:fullscreen]:h-screen [&:fullscreen]:max-h-none [&:fullscreen]:rounded-none"
      >
        <canvas
          ref={canvas}
          role="img"
          aria-label="A 3D solar system. Drag to fling a planet into orbit; use the buttons below or the keyboard to control it."
          className="block h-full w-full cursor-crosshair touch-none bg-space-950"
        />

        {status !== "ready" && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
            <p className="font-display text-[0.65rem] leading-relaxed text-starlight/80">
              {status === "loading"
                ? "Warming up the stars…"
                : "Your browser couldn't start 3D graphics (WebGL). Try another browser, or turn on hardware acceleration."}
            </p>
          </div>
        )}

        {status === "ready" && stats && (
          <div className="pointer-events-none absolute top-2 right-2 rounded-sm bg-space-950/70 px-2.5 py-1.5 text-right text-xs text-starlight/80 sm:top-3 sm:right-3">
            <p className="font-display text-[0.55rem] text-neon-gold">{describeTime(stats.years)}</p>
            <p className="mt-1">
              {paused ? "Paused" : daysPerSecond(speed)}
              {stats.limited && " (slowed to keep up)"}
            </p>
            <p>
              {stats.planets} planet{stats.planets === 1 ? "" : "s"}
            </p>
          </div>
        )}

        {status === "ready" && hints && (
          <div className="absolute top-2 left-2 max-w-[15rem] rounded-sm bg-space-950/75 p-3 text-xs leading-relaxed text-starlight/90 sm:top-3 sm:left-3">
            <ul className="flex flex-col gap-1">
              <li>
                <b className="text-neon-cyan">{touch ? "Drag" : "Drag"}</b> to fling a planet
              </li>
              <li>
                <b className="text-neon-cyan">{touch ? "Tap" : "Click"}</b> for a perfect orbit
              </li>
              <li>
                <b className="text-neon-cyan">{touch ? "Two fingers" : "Right-drag"}</b> to look around
              </li>
              <li>
                <b className="text-neon-cyan">{touch ? "Pinch" : "Scroll"}</b> to zoom
              </li>
            </ul>
            <button
              type="button"
              onClick={() => setHints(false)}
              className="mt-2 min-h-8 font-display text-[0.55rem] text-neon-gold underline underline-offset-4"
            >
              Got it
            </button>
          </div>
        )}
        {status === "ready" && !hints && (
          <button
            type="button"
            onClick={() => setHints(true)}
            aria-label="Show controls"
            className="absolute top-2 left-2 flex size-11 items-center justify-center rounded-sm bg-space-950/70 font-display text-xs text-neon-cyan sm:top-3 sm:left-3"
          >
            ?
          </button>
        )}

        <p aria-live="polite" className="pointer-events-none absolute inset-x-0 bottom-3 px-4 text-center">
          {message && (
            <span className="rounded-sm bg-space-950/80 px-3 py-1.5 text-sm text-starlight">{message}</span>
          )}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div role="group" aria-label="Planet to fling" className="flex flex-wrap gap-2">
          {LOOKS.map((l, i) => (
            <button
              key={l}
              type="button"
              aria-pressed={look === l}
              onClick={() => setLook(l)}
              className={`${button} flex items-center gap-2 ${look === l ? on : off}`}
            >
              <span aria-hidden className="size-3 rounded-full" style={{ background: PLANET_TYPES[l].base }} />
              {PLANET_TYPES[l].label}
              <span className="kbd">{i + 1}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Time speed" className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={paused}
              onClick={() => setPaused((p) => !p)}
              className={`${button} ${paused ? "border-neon-gold bg-neon-gold/15 text-neon-gold" : off}`}
            >
              {paused ? "Play" : "Pause"}
              <span className="kbd">Space</span>
            </button>
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={!paused && speed === s}
                onClick={() => {
                  setSpeedChoice(s);
                  setPaused(false);
                }}
                className={`${button} ${!paused && speed === s ? on : off}`}
              >
                {SPEED_LABEL[s]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <button type="button" aria-pressed={assist} onClick={() => setAssist((a) => !a)} className={`${button} ${assist ? on : off}`}>
              Orbit assist<span className="kbd">A</span>
            </button>
            <button type="button" aria-pressed={trails} onClick={() => setTrails((t) => !t)} className={`${button} ${trails ? on : off}`}>
              Trails<span className="kbd">T</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => engine.current?.addPlanet()}
            className={`${button} border-neon-cyan text-neon-cyan hover:bg-neon-cyan/10`}
          >
            Add planet<span className="kbd">N</span>
          </button>
          <button
            type="button"
            onClick={() => engine.current?.clear()}
            className={`${button} border-neon-magenta text-neon-magenta hover:bg-neon-magenta/10`}
          >
            Clear planets<span className="kbd">Del</span>
          </button>
          <button type="button" onClick={fullscreen} className={`${button} ${off}`}>
            Full screen<span className="kbd">F</span>
          </button>
          {tier && (
            <label className="flex items-center gap-2 text-sm text-starlight/70 sm:ml-auto">
              Quality
              <select
                value={tier}
                onChange={(e) => chooseTier(e.target.value as Tier)}
                className="min-h-11 rounded-sm border-2 border-space-700 bg-space-900 px-2 text-starlight"
              >
                {TIER_ORDER.map((t) => (
                  <option key={t} value={t}>
                    {TIER_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <p className="hidden text-sm text-starlight/60 md:block">
          Keyboard: Space pause · [ ] slower/faster · 1–5 planet type · N add a planet · A orbit assist · T trails · arrows
          and + − move the camera · Esc cancel a fling · Del clear.
        </p>
        <p className="text-sm text-starlight/60">
          Distances are real (in astronomical units, Earth–sun = 1); planets and the sun are drawn bigger so you can see them.
          Quality drops on its own if your device starts to struggle.
          {reduced && " Your device asks for less motion, so time starts at 1×."}
        </p>
      </div>
    </div>
  );
}
