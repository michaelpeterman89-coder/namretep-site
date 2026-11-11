# Star Studio

A gallery (`/studio`) of wacky, visual, interactive experiments, each on its own page (`/studio/<slug>`). Everything runs in the browser: no database, no accounts, no signed-in paths. Don't touch casino or fantasy code from here.

## Files

- `experiments.ts`: **the registry**. One entry per experiment; the gallery shows them in this order (newest first).
- `page.tsx`: the gallery grid (only thumbnails load here, never experiment code). `layout.tsx`: the STAR STUDIO menu bar.
- `_kit/`: shared helpers. `_` keeps Next.js from making it a route.
  - `motion.ts`: `useFrameLoop(onFrame, running)` (pauses in hidden tabs, caps the frame gap) and `useReducedMotion()`.
  - `experiment-page.tsx`: `ExperimentPage` (back link, title, description, credit) and `experimentMetadata(slug)`.
  - `write-png.mjs`: `writePng()` and `seeded()` for thumbnail scripts.
- `<slug>/`: one folder per experiment, holding everything it needs.
- `experiments.test.ts` checks every registry entry has a folder with `page.tsx` and `thumbnail.png`, and that the page uses its own slug.

## Adding an experiment

From a one-line request ("add a flocking birds experiment inspired by X"):

1. **Pick a slug**: lowercase words with dashes, e.g. `boids`. Make the folder `src/app/studio/<slug>/`.
2. **The logic** goes in plain TypeScript with no React or browser APIs when possible (e.g. `<slug>/flock.ts`), with a test beside it (`flock.test.ts`). Tests catch settings that look fine in code but go blank or blow up when run.
3. **The client component** (`<slug>/<slug>.tsx`, starting with `"use client"`):
   - Animate only through `useFrameLoop`. Never call `requestAnimationFrame` directly. Clean up everything in effect cleanups (Next.js keeps left pages hidden in the DOM).
   - Read `useReducedMotion()`. When it's true, start paused and show a still frame (or grow one without animating), with a Play button so the player can choose motion.
   - Work on phones: pointer events (not mouse events), `touch-none` on anything you drag on, buttons at least `min-h-11`, layouts that fit 360px wide, and keep the per-frame work small enough for a phone.
   - Accessible: a canvas gets `role="img"` and an `aria-label`. Controls are real `<button>`s, toggles use `aria-pressed`.
   - Style with the site theme (`pixel-panel`, `font-display`, the `neon-*` / `space-*` / `starlight` colours in `globals.css`). Keep styles inside the component; never edit `globals.css` for an experiment.
4. **The page** (`<slug>/page.tsx`), exactly this shape:
   ```tsx
   import { ExperimentPage, experimentMetadata } from "../_kit/experiment-page";
   import { Boids } from "./boids";

   export const metadata = experimentMetadata("boids");

   export default function BoidsPage() {
     return (
       <ExperimentPage slug="boids">
         <Boids />
       </ExperimentPage>
     );
   }
   ```
5. **The thumbnail** (`<slug>/thumbnail.png`, 4:3, about 480×360): write `<slug>/make-thumbnail.mjs` that runs the real logic in Node and saves it with `writePng` (see `reaction-diffusion/make-thumbnail.mjs`; Node 24 can import the `.ts` file directly). Run `node src/app/studio/<slug>/make-thumbnail.mjs` and look at the image before using it. For WebGL experiments that can't run in Node, screenshot the canvas in headless Chrome instead (see "Checking in a real browser") and crop it to 4:3.
6. **The registry**: import the thumbnail at the top of `experiments.ts` and add an entry at the **top** of `EXPERIMENTS` (`slug`, `title`, `description`, `thumbnail`, optional `inspiredBy: { label, url }`, `added` date).
7. Run `npx next typegen`, then `npm run build`, `npm run lint`, and `npm test` (from `E:\namretep-site`; check the test count went up).

## Rules

- **Original code only.** Build from the idea, not by copying someone's code, shaders, images, sounds, or fonts. Credit the inspiration with `inspiredBy`, linking to a real page you've confirmed exists (not a guess).
- **Self-contained.** An experiment imports only from its own folder, `_kit/`, React, Next.js, and three.js. No other new npm packages without asking the owner first. Experiments never import each other.
- **three.js (approved by the owner, pinned at 0.186.1) loads only inside the experiment.** Put every `import ... from "three"` in files that the client component reaches **only through `await import("./engine")`** in an effect. Anything the component imports normally (labels, settings, types) must not import three, even indirectly. Otherwise three.js lands in the page's first download, and the gallery downloads it too when it pre-loads the link. To check, load `/studio` in headless Chrome and make sure no script contains `WebGLRenderer`.
- **WebGL experiments** drive their render loop from `useFrameLoop`, and their `dispose()` frees every geometry, material, texture, render target, and worker, then calls `renderer.dispose()` and `renderer.forceContextLoss()`.
- **Assets:** only original, procedurally generated, or properly licensed (e.g. NASA public domain). List every source on the experiment's page, and keep any conversion script in the folder.
- **Browser only.** No database tables, API routes, env vars, or `SIGNED_IN_ONLY` entries.
- If a helper would really help several experiments, add it to `_kit/` and keep it small.

## Checking in a real browser

Headless Chrome is installed (`C:/Program Files/Google/Chrome/Application/chrome.exe`). For WebGL, pass `--use-angle=swiftshader --enable-unsafe-swiftshader`. That's software rendering: it's correct but slow, so animations advance less per second than on a real device. Drive it with `puppeteer-core` installed in the session scratchpad, **not** in the project. Open the page, click and drag, emulate a phone (`isMobile`, `hasTouch`) and `prefers-reduced-motion`, collect `pageerror`s, and take screenshots to look at. Run `npm run build` and then `npx next start -p <port>` first.

## Experiments

- `gravity-garden`: three.js solar-system sandbox with real gravity. It's being built in phases (see below).
- `reaction-diffusion`: Gray-Scott model on a pixel grid (`gray-scott.ts`), four presets, paint to seed. Inspired by Karl Sims' tutorial.

## Gravity Garden

A realistic three.js solar-system sandbox. The owner's full vision is built in phases. **After each phase: build, lint, test, and check in headless Chrome (desktop, phone, reduced motion). Then push the `studio` branch for a preview, and wait for the owner's go before merging to `main` or starting the next phase.**

### Phases

1. **Core** ✅ (2026-11-10):
   - Yellow sun.
   - Fling planets with a predicted path, plus orbit assist.
   - Trails, and time controls (pause, 0.1× to 1000×).
   - Realistic look: the sun is the only light, HDR bloom, ACES tone mapping, atmosphere glow, procedural surfaces, NASA Milky Way.
   - Auto quality, keyboard/touch/mouse controls, reduced motion.
2. **Centers**: selectable center types, each looking and behaving differently, plus a mass slider that changes the center's mass live.
   - Yellow sun, red dwarf, white dwarf, binary stars.
   - Blue giant, which can go supernova and blast the system apart.
   - Pulsar with sweeping beams.
   - Black hole: accretion disk, gravitational lensing, stretches and swallows anything too close.
3. **Belts & debris**:
   - Asteroid belts drawn as rings of thousands of rocks. They're instanced test particles that feel gravity but don't pull, so giants clear gaps over time.
   - Comets with tails pointing away from the star, dust disks, and rogue planets flung in from deep space.
   - Moons orbiting planets, and gas-giant rings.
   - Collisions that merge with debris. Moons too close to a planet break into rings (Roche limit). Black-hole tidal streams.
   - Ring and moon shadows.
4. **Overlays & camera**:
   - Toggles for orbit trails, the habitable zone (depends on the center type), a warped space-time gravity grid, and click-for-stats panels.
   - Camera: free orbit, follow any object, or ride along on a planet.
5. **Presets, challenges, share links**:
   - Presets: our solar system, TRAPPIST-1, a Tatooine-style binary, a black hole with orbiting stars, a ringed giant.
   - Challenges: keep 5 planets stable for 1,000 years, a moon orbiting a moon, 3 planets in the habitable zone, survive a supernova.
   - Save or share a system as a link. Encode it in the URL; there's still no database.

### How it's built (Phase 1)

- **`physics.ts`**: N-body gravity in AU, years, and solar masses (G = 4π²).
  - Integrator: leapfrog (kick-drift-kick) with sub-steps sized from the shortest orbital or fly-by timescale (`STEP_FRACTION`). It's capped at `MAX_SUBSTEPS` per frame, and the on-screen clock says "slowed to keep up" when the cap is hit.
  - Events: bodies merge on contact (keeping momentum and volume), stars swallow planets, and bodies past 150 AU escape. The centre of mass is pinned to the origin every step.
  - `predictPath` runs a cloned world for the fling preview, and `onSubstep` lets trails sample mid-frame.
  - Tests cover 1,000 years at 1000× frame sizes, eccentric close passes, merges, escapes, and that predictions match what actually happens.
- **`surfaces.ts` + `surface-worker.ts`**: procedural planet maps (colour, bump, roughness, lava glow, Earth clouds) from seeded 3D noise sampled on the sphere. They're generated in a Web Worker and cached per look, variant, and size.
- **`planet-types.ts`**: the planet catalog (mass, drawn radius, colours). **No three.js here**, because the React component imports it.
- **`planets.ts`**: `PlanetVisual` (sphere, clouds, atmosphere shell shader, trail).
- **`sun.ts`**: sun surface shader, corona sprites, lens-flare overlay scene, and the shared `GLSL_NOISE`.
- **`quality.ts`**:
  - `TIERS` (high, medium, low) sets the pixel ratio, bloom scale, MSAA, lens flare, sphere detail, texture size, trail length, and backdrop size.
  - `startingTier()` picks a level from device hints.
  - `FrameMonitor` steps down a tier after two 1.5-second windows under 45fps. It never steps up by itself.
- **`engine.ts`**: the three.js scene, input, events, and `dispose()`. Loaded only by dynamic import.
  - The composer runs RenderPass, then the flare overlay, then UnrealBloom, then OutputPass with ACES.
  - OrbitControls leave the left button and one finger free for flinging.
- **`gravity-garden.tsx`**: buttons, on-screen clock, hints, keyboard, fullscreen. `page.tsx` lists the sources.
- **Backdrop**: `milky-way-4k.jpg` (high tier) and `milky-way-2k.jpg`.
  - Made by `make-backdrop.mjs` from NASA SVS Deep Star Maps 2020 `starmap_2020_4k.exr`. It's public domain; credit NASA/GSFC SVS and ESA/Gaia/DPAC.
  - Rotated by Earth's axial tilt, so the real sky lines up with the orbital plane.
- **Scale**: real distances in AU, but enlarged bodies (sun 0.25 AU, Earth-like 0.075 AU). Collision radii match the drawn sizes. 1× is one day per second.

### Notes for later phases

- New center types: make the star in `engine.ts` data-driven (mass, radius, colours, light colour and intensity) rather than adding branches. The sun shader already takes `uHot`/`uCool`.
- The habitable zone scales with the square root of luminosity, so keep luminosity on the center type.
- Asteroids: integrate them as massless test particles in a separate typed-array loop, not in `World.bodies` (that loop is O(n²)). Render them with `InstancedMesh`.
- Share links: the system state is small (about 10 numbers per body), so encode it compactly in the URL hash.
