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
5. **The thumbnail** (`<slug>/thumbnail.png`, 4:3, about 480×360): write `<slug>/make-thumbnail.mjs` that runs the real logic in Node and saves it with `writePng` (see `reaction-diffusion/make-thumbnail.mjs`; Node 24 can import the `.ts` file directly). Run `node src/app/studio/<slug>/make-thumbnail.mjs` and look at the image before using it.
6. **The registry**: import the thumbnail at the top of `experiments.ts` and add an entry at the **top** of `EXPERIMENTS` (`slug`, `title`, `description`, `thumbnail`, optional `inspiredBy: { label, url }`, `added` date).
7. Run `npx next typegen`, then `npm run build`, `npm run lint`, and `npm test` (from `E:\namretep-site`; check the test count went up).

## Rules

- **Original code only.** Build from the idea, not by copying someone's code, shaders, images, sounds, or fonts. Credit the inspiration with `inspiredBy`, linking to a real page you've confirmed exists (not a guess).
- **Self-contained.** An experiment imports only from its own folder, `_kit/`, React, and Next.js. No new npm packages without asking the owner first. Experiments never import each other.
- **Browser only.** No database tables, API routes, env vars, or `SIGNED_IN_ONLY` entries.
- If a helper would really help several experiments, add it to `_kit/` and keep it small.

## Experiments

- `reaction-diffusion`: Gray-Scott model on a pixel grid (`gray-scott.ts`), four presets, paint to seed. Inspired by Karl Sims' tutorial.
