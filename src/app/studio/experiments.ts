import type { StaticImageData } from "next/image";
import reactionDiffusionThumb from "./reaction-diffusion/thumbnail.png";

// Every Star Studio experiment, listed once. The gallery shows them in this
// order (newest first). Adding one = an entry here plus its folder at
// src/app/studio/<slug>/ (see CLAUDE.md in this folder).

export type Experiment = {
  /** The folder name and address: /studio/<slug>. Lowercase words joined by dashes. */
  slug: string;
  title: string;
  /** One or two sentences for the gallery card. */
  description: string;
  /** A still from the experiment, kept in its folder as thumbnail.png. */
  thumbnail: StaticImageData;
  /** Where the idea came from. Shown on the card and the experiment page. */
  inspiredBy?: { label: string; url: string };
  /** Date added, YYYY-MM-DD. */
  added: string;
};

export const EXPERIMENTS: Experiment[] = [
  {
    slug: "reaction-diffusion",
    title: "Reaction Diffusion",
    description:
      "Two make-believe chemicals spread and react to grow coral, splitting cells, mazes, and ripples. Paint on it to seed new growth.",
    thumbnail: reactionDiffusionThumb,
    inspiredBy: { label: "Karl Sims' reaction-diffusion tutorial", url: "https://www.karlsims.com/rd.html" },
    added: "2026-11-10",
  },
];

export function getExperiment(slug: string): Experiment {
  const found = EXPERIMENTS.find((e) => e.slug === slug);
  if (!found) throw new Error(`No Star Studio experiment called "${slug}". Add it to experiments.ts.`);
  return found;
}

export function experimentPath(slug: string) {
  return `/studio/${slug}`;
}
