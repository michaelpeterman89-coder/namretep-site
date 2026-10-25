"use client";

import { useLayoutEffect, useRef } from "react";

const COLORS = ["#ff3ea5", "#3ef0ff", "#ffcf3e", "#7b3eff", "#ffffff"];
const BLACKJACK_COLORS = ["#ffcf3e", "#ffcf3e", "#fff1b8", "#ff3ea5", "#3ef0ff"];

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A one-off burst of pixel confetti, centred on its parent (which needs
 * `position: relative`). Bigger and goldier for a blackjack.
 */
export function Burst({ big = false }: { big?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const host = ref.current;
    if (!host || reducedMotion()) return;
    const count = big ? 36 : 18;
    const colors = big ? BLACKJACK_COLORS : COLORS;
    const reach = big ? 120 : 70;
    const pieces: HTMLSpanElement[] = [];
    for (let i = 0; i < count; i++) {
      const piece = document.createElement("span");
      piece.className = "burst-piece";
      piece.style.background = colors[i % colors.length];
      host.appendChild(piece);
      pieces.push(piece);
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const distance = reach * (0.5 + Math.random() * 0.6);
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance - 20;
      piece.animate(
        [
          { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
          { transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(1)`, opacity: 1, offset: 0.7 },
          { transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y + 30}px)) scale(0.4)`, opacity: 0 },
        ],
        { duration: 900 + Math.random() * 400, easing: "cubic-bezier(0.1, 0.8, 0.3, 1)", fill: "forwards" },
      );
    }
    return () => pieces.forEach((p) => p.remove());
  }, [big]);

  return <span ref={ref} aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 z-10" />;
}
