// The backdrop's far-away objects: still, faint, and behind everything, so they
// cost nothing to run and nothing (like the home page's black hole) affects them.
// The images come from scripts/generate-deep-space.mjs. Bigger screens get more.

type DeepObject = {
  name: string;
  w: number;
  h: number;
  opacity: number;
  /** Literal classes so Tailwind sees them. */
  show: string;
  at: React.CSSProperties;
};

const OBJECTS: DeepObject[] = [
  { name: "andromeda", w: 260, h: 130, opacity: 0.7, show: "block", at: { right: "1%", top: "16%" } },
  { name: "orion", w: 180, h: 180, opacity: 0.5, show: "block", at: { left: "-2%", top: "60%" } },
  { name: "cliffs", w: 280, h: 130, opacity: 0.6, show: "block", at: { right: "-1%", bottom: "-1%" } },
  { name: "whirlpool", w: 150, h: 130, opacity: 0.7, show: "hidden md:block", at: { left: "1%", top: "16%" } },
  { name: "ring", w: 90, h: 90, opacity: 0.6, show: "hidden md:block", at: { right: "4%", top: "66%" } },
  { name: "cluster", w: 120, h: 120, opacity: 0.65, show: "hidden md:block", at: { left: "4%", top: "40%" } },
  { name: "jet", w: 210, h: 120, opacity: 0.65, show: "hidden min-[1600px]:block", at: { right: "1%", top: "41%" } },
  { name: "crab", w: 130, h: 115, opacity: 0.5, show: "hidden min-[1600px]:block", at: { left: "21%", top: "10%" } },
  { name: "horsehead", w: 190, h: 160, opacity: 0.45, show: "hidden min-[1600px]:block", at: { right: "26%", bottom: "2%" } },
  { name: "pillars", w: 160, h: 200, opacity: 0.5, show: "hidden min-[1600px]:block", at: { left: "24%", bottom: "-2%" } },
];

export function DeepSpace() {
  return OBJECTS.map(({ name, w, h, opacity, show, at }) => (
    <div
      key={name}
      className={`deep-object ${show}`}
      style={{
        "--w": w,
        "--h": h,
        opacity,
        backgroundImage: `url(/deep-space/${name}.png)`,
        ...at,
      } as React.CSSProperties}
    />
  ));
}
