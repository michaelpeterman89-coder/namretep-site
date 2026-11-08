// The backdrop's far-away objects: tiny, faint, and behind the stars, so you only
// notice them if you look. They drift slowly as the page scrolls (globals.css), and
// nothing (like the home page's black hole) affects them. The images come from
// scripts/generate-deep-space.mjs. Bigger screens get a few more.

type DeepObject = {
  name: string;
  w: number;
  h: number;
  opacity: number;
  /** How far it drifts over a long scroll, px. Different amounts give a sense of depth. */
  drift: number;
  /** Literal classes so Tailwind sees them. */
  show: string;
  at: React.CSSProperties;
};

const OBJECTS: DeepObject[] = [
  { name: "andromeda", w: 260, h: 130, opacity: 0.35, drift: 9, show: "block", at: { right: "7%", top: "19%" } },
  { name: "orion", w: 180, h: 180, opacity: 0.3, drift: 6, show: "block", at: { left: "3%", top: "68%" } },
  { name: "whirlpool", w: 150, h: 130, opacity: 0.35, drift: 12, show: "hidden md:block", at: { left: "9%", top: "14%" } },
  { name: "ring", w: 90, h: 90, opacity: 0.3, drift: 7, show: "hidden md:block", at: { right: "13%", top: "74%" } },
  { name: "cluster", w: 120, h: 120, opacity: 0.35, drift: 10, show: "hidden min-[1600px]:block", at: { left: "14%", top: "43%" } },
  { name: "jet", w: 210, h: 120, opacity: 0.35, drift: 8, show: "hidden min-[1600px]:block", at: { right: "4%", top: "50%" } },
];

export function DeepSpace() {
  return OBJECTS.map(({ name, w, h, opacity, drift, show, at }) => (
    <div
      key={name}
      className={`deep-object ${show}`}
      style={{
        "--w": w,
        "--h": h,
        "--drift": drift,
        opacity,
        backgroundImage: `url(/deep-space/${name}.png)`,
        ...at,
      } as React.CSSProperties}
    />
  ));
}
