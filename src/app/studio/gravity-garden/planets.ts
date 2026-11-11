import * as THREE from "three";
import type { PlanetType } from "./planet-types";
import type { Surface } from "./surfaces";

export { PLANET_TYPES, massOf, type PlanetType } from "./planet-types";

// What each kind of planet is like, and how one is drawn: a lit sphere with a
// generated surface, clouds for Earth-likes, an atmosphere glow, and a trail.


// ---------- Atmosphere ----------

const AIR_VERTEX = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

// For each pixel of the shell, find how close the view ray passes to the planet.
// Air is thickest just above the surface and thins out with height, and only
// the sunlit side glows (with a warm tint at the day/night line).
const AIR_FRAGMENT = /* glsl */ `
uniform vec3 uCenter;
uniform vec3 uSun;
uniform float uInner;
uniform float uOuter;
uniform vec3 uColor;
uniform float uStrength;
varying vec3 vWorld;
void main() {
  vec3 dir = normalize(vWorld - cameraPosition);
  vec3 toCenter = uCenter - cameraPosition;
  float along = dot(toCenter, dir);
  vec3 closest = cameraPosition + dir * along;
  float d = length(closest - uCenter);
  float h = clamp((d - uInner) / (uOuter - uInner), 0.0, 1.0);
  float density = exp(-h * 5.0) * (1.0 - h);
  vec3 n = normalize(closest - uCenter);
  float sunDot = dot(n, normalize(uSun - uCenter));
  float lit = smoothstep(-0.35, 0.45, sunDot);
  float dusk = exp(-pow(sunDot / 0.25, 2.0));
  vec3 color = mix(uColor, vec3(1.0, 0.55, 0.3), dusk * 0.5);
  gl_FragColor = vec4(color * density * lit * uStrength, 1.0);
}
`;

// ---------- Trails ----------

class Trail {
  readonly line: THREE.Line;
  private positions: Float32Array;
  private count = 0;
  private lastX = NaN;
  private lastY = NaN;
  private lastZ = NaN;
  private color: THREE.Color;
  private faded = true;

  constructor(private max: number, color: THREE.Color) {
    this.positions = new Float32Array(max * 3);
    const colors = new Float32Array(max * 4);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 4));
    geometry.setDrawRange(0, 0);
    this.line = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.line.frustumCulled = false;
    this.color = color;
  }

  /** Re-fades the colours so the oldest point is clear and the newest bright. */
  private shade() {
    const colors = this.line.geometry.getAttribute("color") as THREE.BufferAttribute;
    const arr = colors.array as Float32Array;
    for (let i = 0; i < this.count; i++) {
      const t = (i + 1) / this.count;
      arr[i * 4] = this.color.r;
      arr[i * 4 + 1] = this.color.g;
      arr[i * 4 + 2] = this.color.b;
      arr[i * 4 + 3] = t * t * 0.75;
    }
    colors.needsUpdate = true;
  }

  push(x: number, y: number, z: number) {
    const dist = Math.hypot(x - this.lastX, y - this.lastY, z - this.lastZ);
    // Space points by distance, finer close to the star where orbits are tight.
    const spacing = Math.max(0.004, 0.012 * Math.hypot(x, z));
    if (dist < spacing && this.count > 0) {
      // Keep the newest point glued to the planet between samples.
      this.positions.set([x, y, z], (this.count - 1) * 3);
      (this.line.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      return;
    }
    if (this.count === this.max) {
      this.positions.copyWithin(0, 3);
      this.count--;
    }
    this.positions.set([x, y, z], this.count * 3);
    this.count++;
    this.lastX = x;
    this.lastY = y;
    this.lastZ = z;
    this.line.geometry.setDrawRange(0, this.count);
    (this.line.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    this.faded = false;
  }

  /** Once per frame: re-fade if points were added (cheaper than after every point). */
  flush() {
    if (this.faded) return;
    this.faded = true;
    this.shade();
  }

  dispose() {
    this.line.geometry.dispose();
    (this.line.material as THREE.Material).dispose();
  }
}

// ---------- Surfaces ----------

export type SurfaceTextures = {
  color: THREE.DataTexture;
  bump: THREE.DataTexture;
  roughness: THREE.DataTexture;
  emissive: THREE.DataTexture | null;
  clouds: THREE.DataTexture | null;
};

function texture(data: Uint8Array, s: Surface, srgb: boolean) {
  const t = new THREE.DataTexture(data, s.width, s.height, THREE.RGBAFormat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

export function surfaceTextures(s: Surface): SurfaceTextures {
  return {
    color: texture(s.color, s, true),
    bump: texture(s.bump, s, false),
    roughness: texture(s.roughness, s, false),
    emissive: s.emissive ? texture(s.emissive, s, true) : null,
    clouds: s.clouds ? texture(s.clouds, s, false) : null,
  };
}

export function disposeTextures(t: SurfaceTextures) {
  for (const tex of [t.color, t.bump, t.roughness, t.emissive, t.clouds]) tex?.dispose();
}

// ---------- One planet on screen ----------

export class PlanetVisual {
  readonly group = new THREE.Group();
  readonly body: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  readonly trail: Trail;
  private clouds: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial> | null = null;
  private air: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> | null = null;
  private spinAngle = Math.random() * Math.PI * 2;

  constructor(
    readonly type: PlanetType,
    public radius: number,
    geometry: THREE.SphereGeometry,
    trailPoints: number,
  ) {
    this.body = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: type.base, roughness: 0.9, metalness: 0 }),
    );
    // A slight axial tilt, like real planets.
    this.group.rotation.z = (Math.random() - 0.5) * 0.6;
    this.group.add(this.body);

    if (type.airStrength > 0) {
      this.air = new THREE.Mesh(
        geometry,
        new THREE.ShaderMaterial({
          vertexShader: AIR_VERTEX,
          fragmentShader: AIR_FRAGMENT,
          uniforms: {
            uCenter: { value: new THREE.Vector3() },
            uSun: { value: new THREE.Vector3() },
            uInner: { value: 1 },
            uOuter: { value: 1 },
            uColor: { value: new THREE.Color(type.air) },
            uStrength: { value: type.airStrength },
          },
          side: THREE.BackSide,
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false,
        }),
      );
      this.group.add(this.air);
    }
    this.trail = new Trail(trailPoints, new THREE.Color(type.trail).multiplyScalar(0.9));
    this.setRadius(radius);
  }

  setRadius(r: number) {
    this.radius = r;
    this.body.scale.setScalar(r);
    this.clouds?.scale.setScalar(r * 1.012);
    this.air?.scale.setScalar(r * 1.18);
    if (this.air) {
      this.air.material.uniforms.uInner.value = r * 0.98;
      this.air.material.uniforms.uOuter.value = r * 1.18;
    }
  }

  /** Puts the generated surface on, once the worker has made it. */
  applySurface(t: SurfaceTextures) {
    const m = this.body.material;
    m.color.set(0xffffff);
    m.map = t.color;
    m.bumpMap = t.bump;
    m.bumpScale = this.type.look === "gas" ? 0 : 1.6;
    m.roughness = 1;
    m.roughnessMap = t.roughness;
    if (t.emissive) {
      m.emissive.set(0xffffff);
      m.emissiveMap = t.emissive;
      m.emissiveIntensity = 2.6;
    }
    m.needsUpdate = true;
    if (t.clouds && !this.clouds) {
      this.clouds = new THREE.Mesh(
        this.body.geometry,
        new THREE.MeshStandardMaterial({ color: 0xffffff, alphaMap: t.clouds, transparent: true, depthWrite: false, roughness: 1 }),
      );
      this.clouds.scale.setScalar(this.radius * 1.012);
      this.group.add(this.clouds);
    }
  }

  update(x: number, y: number, z: number, sun: THREE.Vector3, spinDelta: number, trails: boolean) {
    this.group.position.set(x, y, z);
    this.spinAngle += spinDelta * this.type.spin * Math.PI * 2;
    this.body.rotation.y = this.spinAngle;
    if (this.clouds) this.clouds.rotation.y = this.spinAngle * 1.08;
    if (this.air) {
      this.air.material.uniforms.uCenter.value.set(x, y, z);
      this.air.material.uniforms.uSun.value.copy(sun);
    }
    this.trail.line.visible = trails;
    this.trail.push(x, y, z);
    this.trail.flush();
  }

  /** Records a point mid-frame, so trails stay smooth curves at high speed. */
  sample(x: number, y: number, z: number) {
    this.trail.push(x, y, z);
  }

  dispose() {
    // Geometry and surface textures are shared, so only per-planet things go here.
    this.body.material.dispose();
    this.clouds?.material.dispose();
    this.air?.material.dispose();
    this.trail.dispose();
  }
}
