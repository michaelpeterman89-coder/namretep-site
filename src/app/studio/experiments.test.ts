import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXPERIMENTS } from "./experiments";

const folder = (slug: string, file: string) => new URL(`./${slug}/${file}`, import.meta.url);

describe("Star Studio registry", () => {
  it("has at least one experiment", () => {
    expect(EXPERIMENTS.length).toBeGreaterThan(0);
  });

  it("uses unique, address-safe slugs", () => {
    const slugs = EXPERIMENTS.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("gives every experiment its own folder with a page and a thumbnail", () => {
    for (const { slug } of EXPERIMENTS) {
      expect(existsSync(folder(slug, "page.tsx")), `${slug}/page.tsx`).toBe(true);
      expect(existsSync(folder(slug, "thumbnail.png")), `${slug}/thumbnail.png`).toBe(true);
    }
  });

  it("wraps each page in the shared frame with its own slug", () => {
    for (const { slug } of EXPERIMENTS) {
      const page = readFileSync(folder(slug, "page.tsx"), "utf8");
      expect(page).toContain(`experimentMetadata("${slug}")`);
      expect(page).toContain(`<ExperimentPage slug="${slug}">`);
    }
  });

  it("has real details on every card", () => {
    for (const e of EXPERIMENTS) {
      expect(e.title.trim()).not.toBe("");
      expect(e.description.trim()).not.toBe("");
      expect(e.added).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (e.inspiredBy) expect(e.inspiredBy.url).toMatch(/^https:\/\//);
    }
  });
});
