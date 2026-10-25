"use client";

import { useStoredToggle } from "@/lib/use-stored-toggle";

const STORAGE_KEY = "namretep:crt";

export function CrtOverlay() {
  const [enabled] = useStoredToggle(STORAGE_KEY, true);
  return enabled ? <div aria-hidden className="crt-overlay" /> : null;
}

export function CrtToggle() {
  const [enabled, setEnabled] = useStoredToggle(STORAGE_KEY, true);
  return (
    <button
      type="button"
      onClick={() => setEnabled(!enabled)}
      aria-pressed={enabled}
      className="pixel-btn bg-space-800 text-starlight"
    >
      CRT {enabled ? "ON" : "OFF"}
    </button>
  );
}
