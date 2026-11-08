// The backdrop's far-away objects: tiny, faint, and painted onto the page's own
// background, so they scroll with it and never slide against what's on the page.
// Nothing (like the home page's black hole) affects them. The images come from
// scripts/generate-deep-space.mjs. Bigger screens get a few more.

type DeepObject = {
  name: string;
  w: number;
  h: number;
  opacity: number;
  /** Literal classes so Tailwind sees them. */
  show: string;
  /** Percentages are of the whole page, so a long page spreads them out. */
  at: React.CSSProperties;
};

const OBJECTS: DeepObject[] = [
  { name: "andromeda", w: 260, h: 130, opacity: 0.35, show: "block", at: { right: "7%", top: "11%" } },
  { name: "orion", w: 180, h: 180, opacity: 0.3, show: "block", at: { left: "3%", top: "68%" } },
  { name: "whirlpool", w: 150, h: 130, opacity: 0.35, show: "hidden md:block", at: { left: "9%", top: "14%" } },
  { name: "ring", w: 90, h: 90, opacity: 0.3, show: "hidden md:block", at: { right: "13%", top: "74%" } },
  { name: "cluster", w: 120, h: 120, opacity: 0.35, show: "hidden min-[1600px]:block", at: { left: "14%", top: "43%" } },
  { name: "jet", w: 210, h: 120, opacity: 0.35, show: "hidden min-[1600px]:block", at: { right: "4%", top: "50%" } },
];

export function DeepSpace() {
  return (
    <div aria-hidden className="deep-field">
      {OBJECTS.map(({ name, w, h, opacity, show, at }) => (
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
      ))}
    </div>
  );
}
