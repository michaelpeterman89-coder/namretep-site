"use client";

import { useSyncExternalStore } from "react";

const CHANGE_EVENT = "namretep:toggle-change";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/**
 * An on/off setting remembered in this browser (e.g. CRT effect, hints).
 * Falls back to `defaultOn` when storage is unavailable.
 */
export function useStoredToggle(key: string, defaultOn: boolean): [boolean, (on: boolean) => void] {
  const read = () => {
    try {
      const value = localStorage.getItem(key);
      return value === null ? defaultOn : value === "on";
    } catch {
      return defaultOn;
    }
  };
  const enabled = useSyncExternalStore(subscribe, read, () => defaultOn);

  const set = (on: boolean) => {
    try {
      localStorage.setItem(key, on ? "on" : "off");
    } catch {
      // Storage unavailable (e.g. private mode); the setting just won't persist.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  return [enabled, set];
}
