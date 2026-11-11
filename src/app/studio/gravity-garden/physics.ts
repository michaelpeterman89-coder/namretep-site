// Newtonian gravity for Gravity Garden. Plain TypeScript, no three.js, so it's
// testable and could move to a worker later.
//
// Units: distance in AU, time in years, mass in solar masses. In those units
// G = 4π², so a planet 1 AU from a 1-solar-mass star takes exactly 1 year to orbit.
//
// Integrator: leapfrog (kick-drift-kick). It's symplectic, so energy doesn't
// creep up or down over thousands of orbits the way simpler methods do. Each
// frame is split into sub-steps sized from the tightest orbit or closest pass
// right now, so fast inner orbits stay smooth even at 1000× speed.

export const G = 4 * Math.PI * Math.PI;
/** Earth's mass in solar masses. */
export const EARTH_MASS = 3.003e-6;
/** Bodies further than this from the system's centre of mass are lost to deep space (AU). */
export const ESCAPE_DISTANCE = 150;
/** Smooths gravity at tiny separations so near misses don't explode (AU). */
const SOFTENING = 0.002;
/** Sub-step size as a fraction of the shortest orbital timescale. ~1/450 of an orbit. */
const STEP_FRACTION = 0.014;
/** Never do more than this many sub-steps in one call, so a slow device can't lock up. */
export const MAX_SUBSTEPS = 2000;

export type BodyKind = "star" | "planet";

export type Body = {
  id: number;
  kind: BodyKind;
  /** What it looks like (e.g. "earth", "gas"); physics doesn't care. */
  look: string;
  name: string;
  mass: number;
  /** Collision radius, AU. Matches the (enlarged) size it's drawn at. */
  radius: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
};

export type SimEvent =
  | { type: "swallowed"; body: Body; by: Body }
  | { type: "merged"; survivor: Body; absorbed: Body }
  | { type: "escaped"; body: Body };

export type StepResult = {
  events: SimEvent[];
  /** Sim time actually advanced, years. Less than asked if the sub-step cap was hit. */
  advanced: number;
  substeps: number;
};

export class World {
  bodies: Body[] = [];
  /** Sim time since the start, years. */
  time = 0;
  private nextId = 1;
  private ax = new Float64Array(0);
  private ay = new Float64Array(0);
  private az = new Float64Array(0);

  add(body: Omit<Body, "id">): Body {
    const b = { ...body, id: this.nextId++ };
    this.bodies.push(b);
    return b;
  }

  remove(id: number) {
    this.bodies = this.bodies.filter((b) => b.id !== id);
  }

  /** A copy for trying things out (path previews) without touching the real one. */
  clone(): World {
    const w = new World();
    w.bodies = this.bodies.map((b) => ({ ...b }));
    w.time = this.time;
    w.nextId = this.nextId;
    return w;
  }

  /**
   * Speed for a circular orbit at `pos`, around everything heavier than `mass`
   * that's nearer the centre (a good approximation when the star dominates).
   */
  circularSpeed(x: number, z: number): number {
    const r = Math.hypot(x, z);
    if (r === 0) return 0;
    let inside = 0;
    for (const b of this.bodies) if (b.kind === "star" || Math.hypot(b.x, b.z) < r * 0.5) inside += b.mass;
    return Math.sqrt((G * inside) / r);
  }

  /** The shortest "how long until things change a lot" time in the system, years. */
  private timescale(): number {
    const bs = this.bodies;
    let best = Infinity;
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i];
        const b = bs[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const r2 = dx * dx + dy * dy + dz * dz + SOFTENING * SOFTENING;
        const r = Math.sqrt(r2);
        // Free-fall time sqrt(r³/GM), and crossing time r/v for fast fly-bys.
        const fall = Math.sqrt((r2 * r) / (G * (a.mass + b.mass)));
        const dvx = b.vx - a.vx;
        const dvy = b.vy - a.vy;
        const dvz = b.vz - a.vz;
        const v = Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz);
        const cross = v > 0 ? r / v : Infinity;
        best = Math.min(best, fall, cross);
      }
    }
    return best;
  }

  private accelerate() {
    const bs = this.bodies;
    const n = bs.length;
    if (this.ax.length < n) {
      this.ax = new Float64Array(n * 2);
      this.ay = new Float64Array(n * 2);
      this.az = new Float64Array(n * 2);
    }
    const { ax, ay, az } = this;
    ax.fill(0, 0, n);
    ay.fill(0, 0, n);
    az.fill(0, 0, n);
    for (let i = 0; i < n; i++) {
      const a = bs[i];
      for (let j = i + 1; j < n; j++) {
        const b = bs[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const r2 = dx * dx + dy * dy + dz * dz + SOFTENING * SOFTENING;
        const inv = G / (r2 * Math.sqrt(r2));
        ax[i] += dx * inv * b.mass;
        ay[i] += dy * inv * b.mass;
        az[i] += dz * inv * b.mass;
        ax[j] -= dx * inv * a.mass;
        ay[j] -= dy * inv * a.mass;
        az[j] -= dz * inv * a.mass;
      }
    }
  }

  private kick(h: number) {
    const { ax, ay, az } = this;
    this.bodies.forEach((b, i) => {
      b.vx += ax[i] * h;
      b.vy += ay[i] * h;
      b.vz += az[i] * h;
    });
  }

  private drift(h: number) {
    for (const b of this.bodies) {
      b.x += b.vx * h;
      b.y += b.vy * h;
      b.z += b.vz * h;
    }
  }

  /** Moves the system forward `years`, in as many sub-steps as it needs. */
  step(years: number, maxSubsteps = MAX_SUBSTEPS, onSubstep?: () => void): StepResult {
    const events: SimEvent[] = [];
    let left = years;
    let substeps = 0;
    this.accelerate();
    while (left > 1e-12 && substeps < maxSubsteps) {
      const h = Math.min(left, STEP_FRACTION * this.timescale());
      this.kick(h / 2);
      this.drift(h);
      this.accelerate();
      this.kick(h / 2);
      left -= h;
      this.time += h;
      substeps++;
      if (this.collide(events)) this.accelerate();
      onSubstep?.();
    }
    this.escape(events);
    this.recentre();
    return { events, advanced: years - left, substeps };
  }

  /**
   * Keeps the centre of mass still at the origin. Without this, flinging a
   * planet nudges the whole system, and it slowly drifts off screen.
   */
  recentre() {
    let m = 0;
    let x = 0, y = 0, z = 0, vx = 0, vy = 0, vz = 0;
    for (const b of this.bodies) {
      m += b.mass;
      x += b.x * b.mass;
      y += b.y * b.mass;
      z += b.z * b.mass;
      vx += b.vx * b.mass;
      vy += b.vy * b.mass;
      vz += b.vz * b.mass;
    }
    if (m === 0) return;
    for (const b of this.bodies) {
      b.x -= x / m;
      b.y -= y / m;
      b.z -= z / m;
      b.vx -= vx / m;
      b.vy -= vy / m;
      b.vz -= vz / m;
    }
  }

  /** Merges anything touching. Returns true if the body list changed. */
  private collide(events: SimEvent[]): boolean {
    const bs = this.bodies;
    let changed = false;
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i];
        const b = bs[j];
        const reach = a.radius + b.radius;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        if (dx * dx + dy * dy + dz * dz > reach * reach) continue;
        const [big, small] = a.mass >= b.mass ? [a, b] : [b, a];
        mergeInto(big, small);
        if (big.kind === "star" && small.kind !== "star") events.push({ type: "swallowed", body: small, by: big });
        else events.push({ type: "merged", survivor: big, absorbed: small });
        bs.splice(bs.indexOf(small), 1);
        changed = true;
        // Start over: indices shifted, and the survivor may now touch something else.
        i = -1;
        break;
      }
    }
    return changed;
  }

  private escape(events: SimEvent[]) {
    const c = this.centreOfMass();
    this.bodies = this.bodies.filter((b) => {
      const far = b.kind !== "star" && Math.hypot(b.x - c.x, b.y - c.y, b.z - c.z) > ESCAPE_DISTANCE;
      if (far) events.push({ type: "escaped", body: b });
      return !far;
    });
  }

  centreOfMass() {
    let m = 0;
    let x = 0;
    let y = 0;
    let z = 0;
    for (const b of this.bodies) {
      m += b.mass;
      x += b.x * b.mass;
      y += b.y * b.mass;
      z += b.z * b.mass;
    }
    return m > 0 ? { x: x / m, y: y / m, z: z / m } : { x: 0, y: 0, z: 0 };
  }

  /** Kinetic plus potential energy. Should stay nearly constant; tests check it. */
  energy(): number {
    let e = 0;
    const bs = this.bodies;
    for (let i = 0; i < bs.length; i++) {
      const a = bs[i];
      e += 0.5 * a.mass * (a.vx * a.vx + a.vy * a.vy + a.vz * a.vz);
      for (let j = i + 1; j < bs.length; j++) {
        const b = bs[j];
        const r = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2 + (b.z - a.z) ** 2 + SOFTENING * SOFTENING);
        e -= (G * a.mass * b.mass) / r;
      }
    }
    return e;
  }
}

/** Sticks `small` onto `big`, keeping total mass and momentum. Volume adds up too. */
export function mergeInto(big: Body, small: Body) {
  const m = big.mass + small.mass;
  for (const axis of ["x", "y", "z"] as const) {
    big[axis] = (big[axis] * big.mass + small[axis] * small.mass) / m;
  }
  big.vx = (big.vx * big.mass + small.vx * small.mass) / m;
  big.vy = (big.vy * big.mass + small.vy * small.mass) / m;
  big.vz = (big.vz * big.mass + small.vz * small.mass) / m;
  // Stars keep their size; planets grow by volume.
  if (big.kind !== "star") big.radius = Math.cbrt(big.radius ** 3 + small.radius ** 3);
  big.mass = m;
}

/**
 * Where a new body would go: steps a copy of the world forward and records the
 * new body's positions. Stops early if it crashes or escapes.
 */
export function predictPath(
  world: World,
  body: Omit<Body, "id">,
  { years, points }: { years: number; points: number },
): { path: Float32Array; count: number; ending: "flying" | "crashed" | "escaped" } {
  const trial = world.clone();
  const b = trial.add(body);
  const path = new Float32Array(points * 3);
  path[0] = b.x;
  path[1] = b.y;
  path[2] = b.z;
  let count = 1;
  const slice = years / (points - 1);
  for (; count < points; count++) {
    const { events } = trial.step(slice, 400);
    for (const e of events) {
      if ((e.type === "swallowed" && e.body.id === b.id) || (e.type === "merged" && e.absorbed.id === b.id))
        return { path, count, ending: "crashed" };
      if (e.type === "escaped" && e.body.id === b.id) return { path, count, ending: "escaped" };
    }
    path[count * 3] = b.x;
    path[count * 3 + 1] = b.y;
    path[count * 3 + 2] = b.z;
  }
  return { path, count, ending: "flying" };
}

/** Years for one orbit at distance r (AU) around `mass` solar masses. */
export function orbitalPeriod(r: number, mass: number) {
  return 2 * Math.PI * Math.sqrt((r * r * r) / (G * mass));
}
