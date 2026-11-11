"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

// Shared helpers every Star Studio experiment should animate with, so they all
// pause in hidden tabs and respect the device's reduced-motion setting.

const REDUCE = "(prefers-reduced-motion: reduce)";

function subscribeReduced(onChange: () => void) {
  const query = window.matchMedia(REDUCE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** True when the device asks for less motion. Updates if the setting changes. */
export function useReducedMotion() {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCE).matches,
    () => false,
  );
}

/**
 * Calls `onFrame(seconds since last frame)` every animation frame while
 * `running` is true and the tab is visible. The gap is capped at 0.1s, so
 * coming back to a tab doesn't make things jump.
 */
export function useFrameLoop(onFrame: (dt: number) => void, running: boolean) {
  const callback = useRef(onFrame);
  useEffect(() => {
    callback.current = onFrame;
  });

  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let last = 0;

    function tick(now: number) {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
      last = now;
      callback.current(dt);
      frame = requestAnimationFrame(tick);
    }
    function start() {
      if (frame || document.hidden) return;
      last = 0;
      frame = requestAnimationFrame(tick);
    }
    function stop() {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    function onVisibility() {
      if (document.hidden) stop();
      else start();
    }

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [running]);
}
