"use client";

import { playSound, SOUND_KEY } from "@/lib/sound";
import { useStoredToggle } from "@/lib/use-stored-toggle";

export function SoundToggle() {
  const [enabled, setEnabled] = useStoredToggle(SOUND_KEY, true);
  return (
    <button
      type="button"
      onClick={() => {
        setEnabled(!enabled);
        // A quick clink so you can hear it's back on.
        if (!enabled) setTimeout(() => playSound("chip"), 0);
      }}
      aria-pressed={enabled}
      className="pixel-btn bg-space-800 text-starlight"
    >
      Sound {enabled ? "ON" : "OFF"}
    </button>
  );
}
