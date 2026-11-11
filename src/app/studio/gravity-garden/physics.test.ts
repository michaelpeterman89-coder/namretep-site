import { describe, expect, it } from "vitest";
import { EARTH_MASS, World, mergeInto, orbitalPeriod, predictPath, type Body } from "./physics";

function sun(world: World) {
  return world.add({ kind: "star", look: "sun", name: "Sun", mass: 1, radius: 0.12, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
}

function planet(r: number, speed: number, extra: Partial<Body> = {}): Omit<Body, "id"> {
  return { kind: "planet", look: "earth", name: "P", mass: EARTH_MASS, radius: 0.02, x: r, y: 0, z: 0, vx: 0, vy: 0, vz: -speed, ...extra };
}

/** Real frame sizes: 1000× speed is ~2.7 years per second, so ~0.046 years per 60fps frame. */
const FRAME_AT_1000X = 2.74 / 60;

describe("Gravity Garden physics", () => {
  it("keeps a circular 1 AU orbit at 1 year per lap", () => {
    const w = new World();
    sun(w);
    const p = w.add(planet(1, w.circularSpeed(1, 0)));
    expect(orbitalPeriod(1, 1)).toBeCloseTo(1, 10);
    w.step(1);
    // Back where it started (the sun wobbles a tiny bit, so allow a little).
    expect(Math.hypot(p.x - 1, p.z)).toBeLessThan(0.01);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(1, 3);
  });

  it("stays stable for 1,000 years of a busy system at 1000× frame sizes", () => {
    const w = new World();
    sun(w);
    for (const [r, m] of [[0.4, 0.06], [1, 1], [1.5, 0.1], [5.2, 318], [9.5, 95]] as const) {
      w.add(planet(r, w.circularSpeed(r, 0), { mass: m * EARTH_MASS }));
    }
    w.recentre();
    const start = w.energy();
    let years = 0;
    while (years < 1000) {
      const { advanced, events } = w.step(FRAME_AT_1000X);
      expect(events).toEqual([]);
      years += advanced;
    }
    expect(w.bodies.length).toBe(6);
    expect(Math.abs((w.energy() - start) / start)).toBeLessThan(1e-3);
    for (const b of w.bodies.slice(1)) {
      const r = Math.hypot(b.x, b.z);
      expect(r).toBeGreaterThan(0.3);
      expect(r).toBeLessThan(10);
    }
  });

  it("follows a very eccentric orbit through a close pass without gaining energy", () => {
    const w = new World();
    sun(w);
    // Far out and slow, so it dives in to about 0.2 AU.
    w.add(planet(3, w.circularSpeed(3, 0) * 0.35));
    w.recentre();
    const start = w.energy();
    for (let i = 0; i < 600; i++) w.step(FRAME_AT_1000X);
    expect(w.bodies.length).toBe(2);
    expect(Math.abs((w.energy() - start) / start)).toBeLessThan(1e-3);
  });

  it("lets the sun swallow a planet that falls straight in", () => {
    const w = new World();
    const s = sun(w);
    const p = w.add(planet(1, 0));
    const events = [];
    for (let i = 0; i < 100 && w.bodies.length > 1; i++) events.push(...w.step(0.02).events);
    expect(w.bodies).toEqual([s]);
    expect(events).toContainEqual(expect.objectContaining({ type: "swallowed", body: expect.objectContaining({ id: p.id }) }));
    expect(s.radius).toBe(0.12);
  });

  it("merges colliding planets, keeping mass and momentum", () => {
    const w = new World();
    const a = w.add(planet(-0.05, 0, { vz: 0, vx: 1, mass: 2e-5 }));
    w.add(planet(0.05, 0, { vz: 0, vx: -1, mass: 1e-5 }));
    w.recentre(); // total momentum is now zero, so the merged body should sit still
    const { events } = w.step(0.1);
    expect(w.bodies).toHaveLength(1);
    const left = w.bodies[0];
    expect(left.id).toBe(a.id);
    expect(left.mass).toBeCloseTo(3e-5, 12);
    expect(left.vx).toBeCloseTo(0, 9);
    expect(left.radius).toBeCloseTo(Math.cbrt(2 * 0.02 ** 3), 6);
    expect(events[0].type).toBe("merged");
  });

  it("merging adds up mass and momentum, and planets grow by volume", () => {
    const big = { id: 1, ...planet(0, 0, { vz: 0, vx: 2, mass: 3e-5 }) };
    const small = { id: 2, ...planet(1, 0, { vz: 0, vx: -1, mass: 1e-5 }) };
    mergeInto(big, small);
    expect(big.mass).toBeCloseTo(4e-5, 12);
    expect(big.vx).toBeCloseTo((3e-5 * 2 - 1e-5) / 4e-5, 9);
    expect(big.x).toBeCloseTo(0.25, 9);
    expect(big.radius).toBeCloseTo(Math.cbrt(2 * 0.02 ** 3), 9);
  });

  it("removes bodies that fly off into deep space", () => {
    const w = new World();
    sun(w);
    w.add(planet(140, 30, { vz: 0, vx: 30 }));
    const { events } = w.step(1);
    expect(w.bodies).toHaveLength(1);
    expect(events[0].type).toBe("escaped");
  });

  it("never runs past the sub-step cap, and says how far it got", () => {
    const w = new World();
    sun(w);
    w.add(planet(0.15, w.circularSpeed(0.15, 0), { radius: 0.001 }));
    const { substeps, advanced } = w.step(100, 50);
    expect(substeps).toBe(50);
    expect(advanced).toBeLessThan(100);
    expect(advanced).toBeGreaterThan(0);
  });

  it("predicts the same path the real simulation then takes", () => {
    const w = new World();
    sun(w);
    const body = planet(1.3, w.circularSpeed(1.3, 0) * 1.1);
    const { path, count, ending } = predictPath(w, body, { years: 2, points: 41 });
    expect(ending).toBe("flying");
    expect(count).toBe(41);
    const p = w.add(body);
    for (let i = 0; i < 40; i++) w.step(2 / 40, 400);
    expect(Math.hypot(p.x - path[40 * 3], p.z - path[40 * 3 + 2])).toBeLessThan(1e-6);
  });

  it("predicts a crash into the sun", () => {
    const w = new World();
    sun(w);
    const { ending } = predictPath(w, planet(1, 0), { years: 1, points: 60 });
    expect(ending).toBe("crashed");
  });
});
