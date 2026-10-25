"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "namretep:crt";
const CHANGE_EVENT = "namretep:crt-change";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function getSnapshot() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

/** CRT effect is on by default; the choice is remembered in this browser. */
function useCrtEnabled() {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}

function setCrtEnabled(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Storage unavailable (e.g. private mode); the toggle just won't persist.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function CrtOverlay() {
  const enabled = useCrtEnabled();
  return enabled ? <div aria-hidden className="crt-overlay" /> : null;
}

export function CrtToggle() {
  const enabled = useCrtEnabled();
  return (
    <button
      type="button"
      onClick={() => setCrtEnabled(!enabled)}
      aria-pressed={enabled}
      className="pixel-btn bg-space-800 text-starlight"
    >
      CRT {enabled ? "ON" : "OFF"}
    </button>
  );
}
