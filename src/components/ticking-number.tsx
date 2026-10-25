"use client";

import { useEffect, useRef, useState } from "react";
import { formatChips } from "@/lib/chips";

/** Shows a chip amount that counts up or down to its new value instead of jumping. */
export function TickingNumber({ value, durationMs = 900 }: { value: number; durationMs?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = value;
      const done = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(done);
    }
    const began = performance.now();
    let frame = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - began) / durationMs);
      const eased = 1 - (1 - p) ** 3;
      const current = Math.round(start + (value - start) * eased);
      from.current = current;
      setShown(current);
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return <>{formatChips(shown)}</>;
}
