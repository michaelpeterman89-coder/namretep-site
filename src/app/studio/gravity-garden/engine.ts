import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { World, predictPath, type Body, type SimEvent } from "./physics";
import { PLANET_TYPES, PlanetVisual, disposeTextures, massOf, surfaceTextures, type SurfaceTextures } from "./planets";
import { FrameMonitor, TIERS, type Tier } from "./quality";
import { createFlare, createSun, type Flare, type Sun } from "./sun";
import { LOOKS, generateSurface, type Look, type Surface } from "./surfaces";

// Gravity Garden's 3D side. Loaded with a dynamic import, so three.js only
// downloads on this page. The React component owns the buttons and calls in
// here; everything WebGL lives and dies in this file.

export type Stats = { years: number; planets: number; tier: Tier; limited: boolean };

export type EngineOptions = {
  canvas: HTMLCanvasElement;
  tier: Tier;
  reducedMotion: boolean;
  backdrops: { "4k": string; "2k": string };
  onStats: (s: Stats) => void;
  onMessage: (text: string) => void;
  onTierChange: (tier: Tier) => void;
  /** Called once the player flings or adds their first planet. */
  onFirstLaunch: () => void;
};

export type Engine = ReturnType<typeof createEngine>;

const SUN_RADIUS = 0.25;
/** Real seconds × this × speed = sim years. 1× is one day per second. */
const YEARS_PER_SECOND_AT_1X = 1 / 365.25;
/** Tilt between the Earth's equator and its orbit, so the real sky lines up with this solar system. */
const OBLIQUITY = (23.44 * Math.PI) / 180;
/** Drag this fraction of the distance from the star to throw at circular-orbit speed. */
const FLING_SCALE = 0.5;
/** Orbit assist snaps when within this fraction of a perfect circular orbit. */
const ASSIST_RANGE = 0.3;
const TAP_PIXELS = 8;

/** The starting system: a lava world, an Earth, a Mars, and a giant further out. */
const STARTERS: { look: Look; r: number; angle: number }[] = [
  { look: "lava", r: 0.5, angle: 0.4 },
  { look: "earth", r: 1.0, angle: 2.2 },
  { look: "mars", r: 1.6, angle: 4.1 },
  { look: "gas", r: 3.6, angle: 5.4 },
];

let nameCounter = 0;

export function createEngine(opts: EngineOptions) {
  const { canvas } = opts;
  const reduced = opts.reducedMotion;

  // ---------- Renderer, scene, camera ----------

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.backgroundIntensity = 0.32;
  scene.backgroundRotation.set(OBLIQUITY, 2.2, 0);
  scene.add(new THREE.AmbientLight(0x8899cc, 0.025));

  const camera = new THREE.PerspectiveCamera(45, 1, 0.005, 5000);
  camera.position.set(0, 3.4, 5.6);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 0.4;
  controls.maxDistance = 120;
  controls.zoomSpeed = 0.8;
  controls.rotateSpeed = 0.6;
  // Left button and one finger are for flinging; looking around is right-drag or two fingers.
  controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE };

  // ---------- Backdrop: NASA's Milky Way ----------

  const loader = new THREE.TextureLoader();
  let backdrop: THREE.Texture | null = null;
  let backdropSize: "4k" | "2k" | null = null;
  let disposed = false;
  function loadBackdrop(size: "4k" | "2k") {
    if (backdropSize === size || (backdropSize === "4k" && size === "2k")) return;
    backdropSize = size;
    loader.load(opts.backdrops[size], (tex) => {
      if (disposed) return tex.dispose();
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      backdrop?.dispose();
      backdrop = tex;
      scene.background = tex;
    });
  }
  // The small one first, so there's a sky right away.
  loadBackdrop("2k");

  // ---------- Sun ----------

  const sun: Sun = createSun(SUN_RADIUS);
  scene.add(sun.group);
  const sunPos = new THREE.Vector3();

  // ---------- Quality and post-processing ----------

  let tier: Tier = opts.tier;
  const monitor = new FrameMonitor(tier);
  let composer: EffectComposer;
  let bloom: UnrealBloomPass;
  let flare: Flare | null = null;
  let flarePass: RenderPass | null = null;
  let width = 1;
  let height = 1;

  function buildPipeline() {
    disposePipeline();
    const q = TIERS[tier];
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: q.msaa });
    composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    if (q.lensFlare) {
      flare ??= createFlare();
      flarePass = new RenderPass(flare.scene, flare.camera);
      flarePass.clear = false;
      flarePass.clearDepth = true;
      composer.addPass(flarePass);
    } else {
      flarePass = null;
    }
    bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), reduced ? 0.4 : 0.55, 0.4, 1.1);
    bloom.enabled = q.bloomScale > 0;
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    if (q.backdrop === "4k") loadBackdrop("4k");
    resize();
  }

  function disposePipeline() {
    if (!composer) return;
    for (const pass of composer.passes) pass.dispose();
    composer.renderTarget1.dispose();
    composer.renderTarget2.dispose();
    composer.dispose();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    const ratio = Math.min(window.devicePixelRatio || 1, TIERS[tier].pixelRatio);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(ratio);
    composer.setSize(width, height);
    const scale = TIERS[tier].bloomScale;
    if (scale > 0) bloom.setSize(Math.round(width * ratio * scale), Math.round(height * ratio * scale));
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  buildPipeline();
  // Tall phone screens see less side to side, so start further back to fit the system in.
  if (camera.aspect < 1.3) camera.position.multiplyScalar(Math.min(2.4, (1.3 / camera.aspect) ** 0.85));
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  function setTier(next: Tier, manual: boolean) {
    if (next === tier) return;
    tier = next;
    if (manual) monitor.reset(next);
    buildPipeline();
    opts.onTierChange(next);
  }

  // ---------- Planet surfaces (made in a worker) ----------

  const geometries = new Map<number, THREE.SphereGeometry>();
  function sphere() {
    const segs = TIERS[tier].segments;
    let g = geometries.get(segs);
    if (!g) {
      g = new THREE.SphereGeometry(1, segs, Math.round(segs / 2));
      geometries.set(segs, g);
    }
    return g;
  }

  let worker: Worker | null = null;
  try {
    worker = new Worker(new URL("./surface-worker.ts", import.meta.url), { type: "module" });
  } catch {
    worker = null; // Fall back to making surfaces on the main thread.
  }
  const surfaces = new Map<string, Promise<SurfaceTextures>>();
  const made: SurfaceTextures[] = [];
  const pending = new Map<number, (s: Surface) => void>();
  let requestId = 0;
  if (worker) {
    worker.onmessage = (e: MessageEvent<{ id: number; surface: Surface }>) => {
      pending.get(e.data.id)?.(e.data.surface);
      pending.delete(e.data.id);
    };
  }

  function surfaceFor(look: Look, variant: number): Promise<SurfaceTextures> {
    const w = TIERS[tier].textureWidth;
    const key = `${look}:${variant}:${w}`;
    let p = surfaces.get(key);
    if (!p) {
      const seed = LOOKS.indexOf(look) * 100 + variant + 1;
      const raw: Promise<Surface> = worker
        ? new Promise((resolve) => {
            const id = ++requestId;
            pending.set(id, resolve);
            worker!.postMessage({ id, look, seed, width: w });
          })
        : new Promise((resolve) => setTimeout(() => resolve(generateSurface(look, seed, w)), 0));
      p = raw.then((s) => {
        const t = surfaceTextures(s);
        made.push(t);
        return t;
      });
      surfaces.set(key, p);
    }
    return p;
  }

  // ---------- The world ----------

  const world = new World();
  world.add({ kind: "star", look: "sun", name: "The sun", mass: 1, radius: SUN_RADIUS, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
  const visuals = new Map<number, PlanetVisual>();

  function addBody(look: Look, x: number, z: number, vx: number, vz: number): Body {
    const type = PLANET_TYPES[look];
    nameCounter++;
    const body = world.add({
      kind: "planet",
      look,
      name: `${type.label} ${nameCounter}`,
      mass: massOf(look),
      radius: type.radius,
      x,
      y: 0,
      z,
      vx,
      vy: 0,
      vz,
    });
    world.recentre();
    const v = new PlanetVisual(type, type.radius, sphere(), TIERS[tier].trailPoints);
    visuals.set(body.id, v);
    scene.add(v.group, v.trail.line);
    const variant = Math.floor(Math.random() * 4);
    surfaceFor(look, variant).then((t) => {
      if (!disposed && visuals.get(body.id) === v) v.applySurface(t);
    });
    return body;
  }

  /** Velocity for a circular, counter-clockwise (seen from above) orbit at (x, z). */
  function circular(x: number, z: number, sense = 1) {
    const r = Math.hypot(x, z);
    const v = world.circularSpeed(x, z) * sense;
    return { vx: (z / r) * v, vz: (-x / r) * v };
  }

  for (const s of STARTERS) {
    const x = Math.cos(s.angle) * s.r;
    const z = Math.sin(s.angle) * s.r;
    const { vx, vz } = circular(x, z);
    addBody(s.look, x, z, vx, vz);
  }

  // ---------- Effects: a flash when something is swallowed or merges ----------

  const flashTex = (() => {
    const size = 64;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const t = Math.min(1, Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) * 2);
        const o = (y * size + x) * 4;
        data[o] = data[o + 1] = data[o + 2] = 255;
        data[o + 3] = Math.round((1 - t) ** 2.5 * 255);
      }
    const t = new THREE.DataTexture(data, size, size);
    t.needsUpdate = true;
    t.magFilter = t.minFilter = THREE.LinearFilter;
    return t;
  })();
  const flashes: { sprite: THREE.Sprite; age: number; size: number }[] = [];
  function flash(x: number, y: number, z: number, color: string, size: number) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: flashTex,
        color: new THREE.Color(color).multiplyScalar(4),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    sprite.position.set(x, y, z);
    scene.add(sprite);
    flashes.push({ sprite, age: 0, size });
  }

  function removeVisual(id: number) {
    const v = visuals.get(id);
    if (!v) return;
    scene.remove(v.group, v.trail.line);
    v.dispose();
    visuals.delete(id);
  }

  function handleEvents(events: SimEvent[]) {
    for (const e of events) {
      if (e.type === "swallowed") {
        flash(e.body.x, e.body.y, e.body.z, "#ffd9a0", 0.9);
        removeVisual(e.body.id);
        opts.onMessage(`The sun swallowed ${e.body.name}.`);
      } else if (e.type === "merged") {
        flash(e.survivor.x, e.survivor.y, e.survivor.z, "#ffffff", e.survivor.radius * 10);
        removeVisual(e.absorbed.id);
        visuals.get(e.survivor.id)?.setRadius(e.survivor.radius);
        opts.onMessage(`${e.absorbed.name} crashed into ${e.survivor.name}.`);
      } else {
        removeVisual(e.body.id);
        opts.onMessage(`${e.body.name} drifted off into deep space.`);
      }
    }
  }

  // ---------- Flinging ----------

  let look: Look = "earth";
  let assist = true;
  let trails = true;
  let speed = reduced ? 1 : 10;
  let paused = false;
  let launched = false;

  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();

  type Drag = { id: number; start: THREE.Vector3; end: THREE.Vector3; sx: number; sy: number; moved: boolean; dirty: boolean; perfect: boolean };
  let drag: Drag | null = null;
  const touches = new Set<number>();

  const ghost = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  ghost.visible = false;
  scene.add(ghost);

  const PATH_POINTS = 360;
  const pathGeometry = new THREE.BufferGeometry();
  pathGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(PATH_POINTS * 3), 3));
  const pathMaterial = new THREE.LineDashedMaterial({ color: 0x3ef0ff, dashSize: 0.06, gapSize: 0.05, transparent: true, opacity: 0.9 });
  const pathLine = new THREE.Line(pathGeometry, pathMaterial);
  pathLine.frustumCulled = false;
  pathLine.visible = false;
  scene.add(pathLine);

  const aimGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const aimLine = new THREE.Line(aimGeometry, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
  aimLine.frustumCulled = false;
  aimLine.visible = false;
  scene.add(aimLine);

  function toPlane(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray.intersectPlane(plane, hit) ? hit.clone() : null;
  }

  /** The launch velocity for the current drag, after orbit assist. */
  function launchVelocity(d: Drag) {
    const { x, z } = d.start;
    const r = Math.hypot(x, z);
    const vc = world.circularSpeed(x, z);
    if (!d.moved) return { ...circular(x, z), perfect: true };
    const k = vc / (FLING_SCALE * r);
    const vx = (d.end.x - d.start.x) * k;
    const vz = (d.end.z - d.start.z) * k;
    if (assist) {
      // Which way round is the throw going? Snap to that circular orbit if close.
      const sense = x * vz - z * vx < 0 ? 1 : -1;
      const c = circular(x, z, sense);
      if (Math.hypot(vx - c.vx, vz - c.vz) < ASSIST_RANGE * vc) return { ...c, perfect: true };
    }
    return { vx, vz, perfect: false };
  }

  function updatePreview(d: Drag) {
    const type = PLANET_TYPES[look];
    const { vx, vz, perfect } = launchVelocity(d);
    d.perfect = perfect;
    const r = Math.hypot(d.start.x, d.start.z);
    // Long enough to show a couple of laps of a typical orbit there.
    const years = Math.min(40, 2.2 * 2 * Math.PI * Math.sqrt(r ** 3 / (4 * Math.PI ** 2)) + 0.3);
    const { path, count } = predictPath(
      world,
      { kind: "planet", look, name: "", mass: massOf(look), radius: type.radius, x: d.start.x, y: 0, z: d.start.z, vx, vy: 0, vz },
      { years, points: PATH_POINTS },
    );
    const attr = pathGeometry.getAttribute("position") as THREE.BufferAttribute;
    (attr.array as Float32Array).set(path.subarray(0, count * 3));
    attr.needsUpdate = true;
    pathGeometry.setDrawRange(0, count);
    pathLine.computeLineDistances();
    pathMaterial.color.set(perfect ? 0xffcf3e : 0x3ef0ff);
    pathLine.visible = true;

    ghost.position.copy(d.start);
    ghost.scale.setScalar(type.radius);
    (ghost.material as THREE.MeshBasicMaterial).color.set(type.base);
    ghost.visible = true;

    const aim = aimGeometry.getAttribute("position") as THREE.BufferAttribute;
    aim.setXYZ(0, d.start.x, 0, d.start.z);
    aim.setXYZ(1, d.end.x, 0, d.end.z);
    aim.needsUpdate = true;
    aimLine.visible = d.moved;
  }

  function endDrag() {
    drag = null;
    ghost.visible = false;
    pathLine.visible = false;
    aimLine.visible = false;
  }

  function firstLaunch() {
    if (launched) return;
    launched = true;
    opts.onFirstLaunch();
  }

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === "touch") {
      touches.add(e.pointerId);
      // A second finger means looking around, not flinging.
      if (touches.size > 1) return endDrag();
    }
    if (e.button !== 0) return;
    const p = toPlane(e.clientX, e.clientY);
    if (!p || Math.hypot(p.x, p.z) < SUN_RADIUS * 1.6 || Math.hypot(p.x, p.z) > 60) return;
    drag = { id: e.pointerId, start: p, end: p.clone(), sx: e.clientX, sy: e.clientY, moved: false, dirty: true, perfect: false };
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < TAP_PIXELS) return;
    const p = toPlane(e.clientX, e.clientY);
    if (!p) return;
    drag.moved = true;
    drag.end.copy(p);
    drag.dirty = true;
  }

  function onPointerUp(e: PointerEvent) {
    touches.delete(e.pointerId);
    if (!drag || e.pointerId !== drag.id) return;
    const { vx, vz } = launchVelocity(drag);
    addBody(look, drag.start.x, drag.start.z, vx, vz);
    endDrag();
    firstLaunch();
  }

  function onPointerCancel(e: PointerEvent) {
    touches.delete(e.pointerId);
    if (drag?.id === e.pointerId) endDrag();
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  const noMenu = (e: Event) => e.preventDefault();
  canvas.addEventListener("contextmenu", noMenu);

  // ---------- Each frame ----------

  let clock = 0;
  let statsTimer = 0;
  let limited = false;
  const sunNdc = new THREE.Vector3();
  const sunRay = new THREE.Raycaster();

  function frame(dt: number) {
    clock += dt;
    const change = monitor.push(dt);
    if (change) setTier(change, false);

    if (!paused) {
      const want = dt * speed * YEARS_PER_SECOND_AT_1X;
      // Sample trails at every sub-step: at 1000× a planet can cover a big
      // part of its orbit in one frame, and per-frame points look jagged.
      const { events, advanced } = world.step(want, undefined, () => {
        for (const b of world.bodies) visuals.get(b.id)?.sample(b.x, b.y, b.z);
      });
      limited = advanced < want * 0.95;
      handleEvents(events);
    }
    if (drag?.dirty) {
      drag.dirty = false;
      updatePreview(drag);
    }

    const star = world.bodies.find((b) => b.kind === "star")!;
    sunPos.set(star.x, star.y, star.z);
    sun.group.position.copy(sunPos);
    sun.update(clock * (reduced ? 0.25 : 1));

    // Spin is for looks; keep it calm at high speeds.
    const spin = paused ? 0 : dt * Math.min(4, 0.6 + Math.log10(Math.max(1, speed)));
    for (const b of world.bodies) {
      const v = visuals.get(b.id);
      if (v) v.update(b.x, b.y, b.z, sunPos, spin * (reduced ? 0.4 : 1), trails);
    }

    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.age += dt;
      const t = f.age / 0.9;
      f.sprite.scale.setScalar(f.size * (reduced ? 0.6 : 0.3 + t));
      f.sprite.material.opacity = Math.max(0, 1 - t);
      if (t >= 1) {
        scene.remove(f.sprite);
        f.sprite.material.dispose();
        flashes.splice(i, 1);
      }
    }

    controls.update(dt);

    if (flare && flarePass) {
      sunNdc.copy(sunPos).project(camera);
      // Hidden behind a planet? Then no glare.
      sunRay.set(camera.position, sunPos.clone().sub(camera.position).normalize());
      const blockers = [...visuals.values()].map((v) => v.body);
      const blocked = sunRay.intersectObjects(blockers, false).some((h) => h.distance < camera.position.distanceTo(sunPos));
      const onScreen = Math.abs(sunNdc.x) < 1.1 && Math.abs(sunNdc.y) < 1.1;
      flare.update(sunNdc, blocked || !onScreen ? 0 : 1, width / height);
    }

    composer.render(dt);

    statsTimer += dt;
    if (statsTimer > 0.25) {
      statsTimer = 0;
      opts.onStats({ years: world.time, planets: world.bodies.length - 1, tier, limited: limited && !paused });
    }
  }

  // ---------- Controls the React side calls ----------

  const spherical = new THREE.Spherical();
  const offset = new THREE.Vector3();

  return {
    frame,
    setSpeed(next: number) {
      speed = next;
    },
    setPaused(next: boolean) {
      paused = next;
    },
    setLook(next: Look) {
      look = next;
      if (drag) drag.dirty = true;
    },
    setAssist(next: boolean) {
      assist = next;
      if (drag) drag.dirty = true;
    },
    setTrails(next: boolean) {
      trails = next;
    },
    setTier,
    /** Drops a planet of the current type into a perfect orbit at a random spot. */
    addPlanet() {
      const planets = world.bodies.filter((b) => b.kind === "planet");
      const far = Math.max(1, ...planets.map((b) => Math.hypot(b.x, b.z)));
      const r = 0.6 + Math.random() * Math.min(4, far);
      const a = Math.random() * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const { vx, vz } = circular(x, z);
      addBody(look, x, z, vx, vz);
      firstLaunch();
    },
    clear() {
      for (const b of world.bodies.filter((b) => b.kind === "planet")) {
        removeVisual(b.id);
        world.remove(b.id);
      }
      world.recentre();
      endDrag();
    },
    cancelDrag: endDrag,
    /** Turn the camera: dx around, dy up and down, in radians. */
    orbit(dx: number, dy: number) {
      offset.copy(camera.position).sub(controls.target);
      spherical.setFromVector3(offset);
      spherical.theta += dx;
      spherical.phi = Math.min(Math.PI - 0.05, Math.max(0.05, spherical.phi + dy));
      offset.setFromSpherical(spherical);
      camera.position.copy(controls.target).add(offset);
    },
    /** Zoom in (factor < 1) or out (> 1). */
    zoom(factor: number) {
      offset.copy(camera.position).sub(controls.target);
      const d = Math.min(controls.maxDistance, Math.max(controls.minDistance, offset.length() * factor));
      camera.position.copy(controls.target).add(offset.setLength(d));
    },
    dispose() {
      disposed = true;
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("contextmenu", noMenu);
      controls.dispose();
      worker?.terminate();
      pending.clear();
      for (const id of [...visuals.keys()]) removeVisual(id);
      for (const f of flashes) f.sprite.material.dispose();
      for (const t of made) disposeTextures(t);
      for (const g of geometries.values()) g.dispose();
      flashTex.dispose();
      ghost.geometry.dispose();
      (ghost.material as THREE.Material).dispose();
      pathGeometry.dispose();
      pathMaterial.dispose();
      aimGeometry.dispose();
      (aimLine.material as THREE.Material).dispose();
      sun.dispose();
      flare?.dispose();
      backdrop?.dispose();
      disposePipeline();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
