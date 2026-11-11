import { EARTH_MASS } from "./physics";
import type { Look } from "./surfaces";

// What each kind of planet is like. No three.js in here, so the page's buttons
// can use it without pulling three.js into the page's first download.

export type PlanetType = {
  look: Look;
  label: string;
  /** Mass in Earth masses. */
  earths: number;
  /** Drawn and collision radius, AU (enlarged so you can see it). */
  radius: number;
  /** Shown until the generated surface arrives, and used for the trail. */
  base: string;
  trail: string;
  /** Atmosphere glow colour and strength (0 = none). */
  air: string;
  airStrength: number;
  /** Spin, turns per real second at 1× (visual only). */
  spin: number;
};

export const PLANET_TYPES: Record<Look, PlanetType> = {
  earth: { look: "earth", label: "Earth-like", earths: 1, radius: 0.075, base: "#2a5a8a", trail: "#5ab8ff", air: "#5aa8ff", airStrength: 1.2, spin: 0.05 },
  mars: { look: "mars", label: "Mars-like", earths: 0.11, radius: 0.055, base: "#b5603a", trail: "#ff8a5a", air: "#ffb38a", airStrength: 0.35, spin: 0.05 },
  lava: { look: "lava", label: "Lava world", earths: 0.6, radius: 0.06, base: "#3a2018", trail: "#ff5a2a", air: "#ff7a3a", airStrength: 0.45, spin: 0.04 },
  ice: { look: "ice", label: "Ice world", earths: 0.8, radius: 0.065, base: "#c8dcea", trail: "#9ae8ff", air: "#bfeaff", airStrength: 0.5, spin: 0.04 },
  gas: { look: "gas", label: "Gas giant", earths: 200, radius: 0.18, base: "#d8bf94", trail: "#ffcf3e", air: "#ffe2b0", airStrength: 0.7, spin: 0.12 },
};

export const massOf = (look: Look) => PLANET_TYPES[look].earths * EARTH_MASS;
