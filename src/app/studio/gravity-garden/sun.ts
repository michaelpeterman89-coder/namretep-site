import * as THREE from "three";

// The yellow sun: a boiling surface shader (granulation and limb darkening),
// a soft corona, and a lens-flare glare drawn over the picture. Colours are in
// HDR (above 1), so bloom picks them up and tone mapping rolls them off.

/** Hash-based 3D value noise and fbm, written for this project. */
export const GLSL_NOISE = /* glsl */ `
float gg_hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float gg_noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(gg_hash(i), gg_hash(i + vec3(1,0,0)), f.x), mix(gg_hash(i + vec3(0,1,0)), gg_hash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(gg_hash(i + vec3(0,0,1)), gg_hash(i + vec3(1,0,1)), f.x), mix(gg_hash(i + vec3(0,1,1)), gg_hash(i + vec3(1,1,1)), f.x), f.y),
    f.z);
}
float gg_fbm(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * gg_noise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return s;
}
`;

const SUN_VERTEX = /* glsl */ `
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  vObj = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const SUN_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec3 uHot;
uniform vec3 uCool;
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vWorld;
${GLSL_NOISE}
void main() {
  vec3 p = normalize(vObj);
  // Convection cells: warped noise drifting slowly.
  vec3 q = p * 9.0 + vec3(0.0, uTime * 0.05, 0.0);
  float warp = gg_fbm(p * 3.0 + uTime * 0.02);
  float cells = gg_fbm(q + warp * 2.5);
  float spots = smoothstep(0.62, 0.75, gg_fbm(p * 2.0 - uTime * 0.01));
  vec3 color = mix(uCool, uHot, smoothstep(0.25, 0.75, cells));
  color *= 1.0 - spots * 0.55;
  // Limb darkening: the edge of a star looks dimmer and redder.
  float mu = clamp(dot(normalize(cameraPosition - vWorld), normalize(vNormalW)), 0.0, 1.0);
  float limb = 0.35 + 0.65 * pow(mu, 0.55);
  color *= limb;
  color = mix(color * vec3(1.0, 0.75, 0.5), color, mu);
  gl_FragColor = vec4(color, 1.0);
}
`;

/** A soft radial glow texture, white in the middle fading to nothing. */
function glowTexture(size: number, falloff: (t: number) => number) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const t = Math.min(1, Math.hypot(dx, dy) * 2);
      const v = Math.round(Math.max(0, Math.min(1, falloff(t))) * 255);
      const o = (y * size + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = 255;
      data[o + 3] = v;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.needsUpdate = true;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

export type Sun = {
  group: THREE.Group;
  light: THREE.PointLight;
  radius: number;
  update(seconds: number): void;
  dispose(): void;
};

export function createSun(radius: number): Sun {
  const group = new THREE.Group();

  const material = new THREE.ShaderMaterial({
    vertexShader: SUN_VERTEX,
    fragmentShader: SUN_FRAGMENT,
    uniforms: {
      uTime: { value: 0 },
      uHot: { value: new THREE.Color(1.0, 0.86, 0.6).multiplyScalar(4.5) },
      uCool: { value: new THREE.Color(1.0, 0.45, 0.12).multiplyScalar(2.6) },
    },
  });
  const geometry = new THREE.SphereGeometry(radius, 64, 32);
  const surface = new THREE.Mesh(geometry, material);
  group.add(surface);

  // Corona: two additive glows, a tight bright one and a wide faint one.
  const coronaTex = glowTexture(128, (t) => Math.pow(1 - t, 3.2));
  const coronaInner = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: coronaTex,
      color: new THREE.Color(1.0, 0.75, 0.45).multiplyScalar(1.1),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }),
  );
  coronaInner.scale.setScalar(radius * 3.2);
  const coronaOuter = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: coronaTex,
      color: new THREE.Color(1.0, 0.7, 0.4).multiplyScalar(0.035),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }),
  );
  coronaOuter.scale.setScalar(radius * 9);
  group.add(coronaInner, coronaOuter);

  // The real light source: planets get day and night sides from this alone.
  const light = new THREE.PointLight(0xfff1dc, 3.4, 0, 0);
  group.add(light);

  return {
    group,
    light,
    radius,
    update(seconds) {
      material.uniforms.uTime.value = seconds;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      coronaTex.dispose();
      coronaInner.material.dispose();
      coronaOuter.material.dispose();
    },
  };
}

// ---------- Lens flare ----------

/**
 * Camera glare: ghosts along the line from the sun through the middle of the
 * screen, plus a starburst on the sun. Drawn in its own overlay scene so it
 * works with the bloom pipeline. Fades out when a planet blocks the sun.
 */
export type Flare = {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  update(sunNdc: THREE.Vector3, visible: number, aspect: number): void;
  dispose(): void;
};

const GHOSTS = [
  { at: 0.35, size: 0.07, color: [0.5, 0.75, 1.0], strength: 0.18 },
  { at: 0.6, size: 0.04, color: [1.0, 0.7, 0.4], strength: 0.25 },
  { at: 1.15, size: 0.12, color: [0.4, 1.0, 0.7], strength: 0.08 },
  { at: 1.5, size: 0.06, color: [0.8, 0.5, 1.0], strength: 0.14 },
  { at: 1.9, size: 0.18, color: [0.5, 0.7, 1.0], strength: 0.06 },
] as const;

export function createFlare(): Flare {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
  camera.position.z = 5;
  const ring = glowTexture(64, (t) => Math.exp(-(((t - 0.8) / 0.12) ** 2)) * 0.8 + (t < 0.8 ? 0.15 : 0));
  const soft = glowTexture(64, (t) => Math.pow(1 - t, 2));
  // Starburst: thin spikes radiating from the sun.
  const burstSize = 256;
  const burstData = new Uint8Array(burstSize * burstSize * 4);
  for (let y = 0; y < burstSize; y++) {
    for (let x = 0; x < burstSize; x++) {
      const dx = (x + 0.5) / burstSize - 0.5;
      const dy = (y + 0.5) / burstSize - 0.5;
      const r = Math.hypot(dx, dy) * 2;
      const a = Math.atan2(dy, dx);
      const spikes = Math.pow(Math.abs(Math.cos(a * 3)), 60) + 0.5 * Math.pow(Math.abs(Math.cos(a * 3 + 0.52)), 120);
      const v = Math.max(0, 1 - r) ** 2 * spikes + Math.max(0, 1 - r * 3) ** 3 * 0.6;
      const o = (y * burstSize + x) * 4;
      burstData[o] = burstData[o + 1] = burstData[o + 2] = 255;
      burstData[o + 3] = Math.round(Math.min(1, v) * 255);
    }
  }
  const burstTex = new THREE.DataTexture(burstData, burstSize, burstSize);
  burstTex.needsUpdate = true;
  burstTex.magFilter = burstTex.minFilter = THREE.LinearFilter;

  const make = (map: THREE.Texture, color: THREE.Color) =>
    new THREE.Sprite(
      new THREE.SpriteMaterial({ map, color, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true }),
    );
  const burst = make(burstTex, new THREE.Color(1.0, 0.85, 0.65));
  scene.add(burst);
  const ghosts = GHOSTS.map((g, i) => {
    const s = make(i % 2 ? soft : ring, new THREE.Color(...g.color));
    scene.add(s);
    return s;
  });

  return {
    scene,
    camera,
    update(sun, visible, aspect) {
      camera.left = -aspect;
      camera.right = aspect;
      camera.updateProjectionMatrix();
      const on = visible > 0.01 && sun.z < 1;
      scene.visible = on;
      if (!on) return;
      const sx = sun.x * aspect;
      const sy = sun.y;
      // Ghosts fade as the sun nears the edge of the frame.
      const edge = Math.max(0, 1 - Math.max(Math.abs(sun.x), Math.abs(sun.y)) ** 2);
      burst.position.set(sx, sy, 0);
      burst.scale.setScalar(0.45);
      burst.material.opacity = 0.3 * visible;
      GHOSTS.forEach((g, i) => {
        const s = ghosts[i];
        s.position.set(sx * (1 - g.at * 2) , sy * (1 - g.at * 2), 0);
        s.scale.setScalar(g.size * 2);
        s.material.opacity = g.strength * visible * edge;
      });
    },
    dispose() {
      ring.dispose();
      soft.dispose();
      burstTex.dispose();
      for (const s of [burst, ...ghosts]) s.material.dispose();
    },
  };
}
