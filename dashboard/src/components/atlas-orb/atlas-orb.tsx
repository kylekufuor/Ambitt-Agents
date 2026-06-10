"use client";

// AtlasOrb — the JARVIS neural core.
//
// Inspired by the Age-of-Ultron hologram: a sphere of golden filament
// circuitry — great-circle arc fragments, radial spokes, surface circuit
// patches — around a white-hot center. Built as ~90k GPU particles sampled
// densely along the filament paths (particle trails read grittier and more
// holographic than solid lines, and WebGL can't thicken lines anyway).
//
// Three counter-rotating shells (outer slow, mid reverse, inner fast) give
// the layered orbital motion from the film. Each filament group renders
// twice — a soft oversized pass underneath (cheap bloom) and a sharp pass on
// top — so the glow holds up at high DPR.
//
// States (smoothly lerped uniforms, never a hard cut):
//   idle      — slow shell rotation, calm amber, core breathing
//   listening — brightens, rotation eases, slight inward contraction
//   thinking  — shells spin ~3×, filament turbulence, core flicker
//   speaking  — audio level drives radial swell + brightness + flicker rate
//
// Audio: pass `levelRef` (mutable 0..1). The render loop reads it per frame —
// no React re-renders in the hot path. V2 wires this to an AnalyserNode on
// the ElevenLabs output stream.

import { useEffect, useRef } from "react";
import * as THREE from "three";

export type OrbState = "idle" | "listening" | "thinking" | "speaking";

interface AtlasOrbProps {
  state?: OrbState;
  /** Mutable 0..1 audio level, read per-frame (no re-renders). */
  levelRef?: React.MutableRefObject<number>;
  /**
   * Atlas's remaining context capacity, 0..1. Grades the hologram's color:
   * 1.0 = fresh golden amber, 0 = deep ember red. Lerped smoothly.
   */
  capacity?: number;
  /** Canvas square size in px. */
  size?: number;
  className?: string;
}

const STATE_TARGETS: Record<
  OrbState,
  { brightness: number; spinMul: number; contract: number; turb: number; rim: number; core: number }
> = {
  idle: { brightness: 1.05, spinMul: 1.0, contract: 0.0, turb: 0.0, rim: 0.32, core: 0.75 },
  listening: { brightness: 1.4, spinMul: 0.55, contract: 1.0, turb: 0.0, rim: 0.7, core: 1.0 },
  thinking: { brightness: 1.22, spinMul: 3.0, contract: 0.25, turb: 1.0, rim: 0.5, core: 1.15 },
  speaking: { brightness: 1.45, spinMul: 1.3, contract: 0.0, turb: 0.1, rim: 0.8, core: 1.2 },
};

// Mulberry32 — seeded PRNG so Atlas is the same neural core every visit.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-9);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

const FILAMENT_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uContract;
  uniform float uAudio;
  uniform float uTurb;
  uniform float uPixelRatio;
  uniform float uSizeMul;
  attribute float aScale;
  attribute vec3 aColor;
  attribute float aRand;
  varying vec3 vColor;
  varying float vFlicker;

  void main() {
    vec3 pos = position;

    // Thinking turbulence — filaments shiver.
    pos += uTurb * 0.035 * vec3(
      sin(uTime * 2.3 + aRand * 41.0),
      sin(uTime * 1.9 + aRand * 29.0),
      cos(uTime * 2.6 + aRand * 53.0)
    );

    // Speaking swell — radial push, desynced per particle.
    float swell = 1.0 + uAudio * 0.13 * (0.5 + 0.5 * sin(aRand * 40.0 + uTime * 9.0));
    pos *= swell;

    // Listening contraction.
    pos *= 1.0 - uContract * 0.04;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aScale * uSizeMul * uPixelRatio * (5.2 / -mv.z);
    vColor = aColor;

    // Holographic flicker — slow shimmer idle, faster + deeper with audio.
    float rate = 2.0 + aRand * 4.0 + uAudio * 6.0;
    vFlicker = 0.78 + 0.22 * sin(uTime * rate + aRand * 120.0);
  }
`;

const FILAMENT_FRAG = /* glsl */ `
  uniform float uBrightness;
  uniform float uAlphaMul;
  uniform float uCapacity;
  varying vec3 vColor;
  varying float vFlicker;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float alpha = pow(smoothstep(0.5, 0.0, d), 1.7) * uAlphaMul;
    // Context-capacity color grade: full capacity leaves the amber palette
    // untouched; as capacity drains, green/blue collapse and the hologram
    // smolders toward ember red.
    vec3 graded = vColor * vec3(
      1.0,
      mix(0.34, 1.0, uCapacity),
      mix(0.18, 1.0, uCapacity)
    );
    gl_FragColor = vec4(graded * uBrightness * vFlicker, alpha);
  }
`;

// No backdrop, no boundary shell — the hologram floats bare on the page,
// exactly like the film. The filaments and their glow are the whole object.

// ---------------------------------------------------------------------------
// Filament network generation
// ---------------------------------------------------------------------------
//
// Each shell gets its own geometry (so shells can counter-rotate). Particles
// are pushed into flat arrays via this small accumulator.

interface ParticleSink {
  positions: number[];
  colors: number[];
  scales: number[];
  rands: number[];
}

// Palette — graded amber. Highlight filaments run white-hot.
const C_DEEP = new THREE.Color("#b04f08");
const C_BASE = new THREE.Color("#f59825");
const C_HIGH = new THREE.Color("#ffd98c");
const C_HOT = new THREE.Color("#fff4dd");

function pushPoint(
  sink: ParticleSink,
  rand: () => number,
  x: number,
  y: number,
  z: number,
  color: THREE.Color,
  brightness: number,
  scale: number
) {
  // Tiny positional grain so trails don't read as perfect curves.
  sink.positions.push(
    x + gaussian(rand) * 0.0035,
    y + gaussian(rand) * 0.0035,
    z + gaussian(rand) * 0.0035
  );
  const v = brightness * (0.85 + rand() * 0.3);
  sink.colors.push(color.r * v, color.g * v, color.b * v);
  sink.scales.push(scale * (0.7 + rand() * 0.6));
  sink.rands.push(rand());
}

// Random orientation basis: returns two orthonormal vectors spanning a great
// circle plane, oriented by a random quaternion.
function randomBasis(rand: () => number): [THREE.Vector3, THREE.Vector3] {
  const q = new THREE.Quaternion(
    gaussian(rand),
    gaussian(rand),
    gaussian(rand),
    gaussian(rand)
  ).normalize();
  const u = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  const v = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  return [u, v];
}

// Arc fragments — the dominant structure. Short pieces of great circles at a
// given shell radius, like shattered orbital rings.
function addArcs(
  sink: ParticleSink,
  rand: () => number,
  count: number,
  rMin: number,
  rMax: number
) {
  const SPACING = 0.0048;
  for (let i = 0; i < count; i++) {
    const r = rMin + rand() * (rMax - rMin);
    const [u, v] = randomBasis(rand);
    const theta0 = rand() * Math.PI * 2;
    const arcLen = 0.15 + Math.pow(rand(), 1.6) * 1.5; // most short, few long
    const steps = Math.max(4, Math.floor((r * arcLen) / SPACING));

    // A handful of arcs run white-hot; most stay dim so the bright ones pop.
    const roll = rand();
    const color =
      roll < 0.06 ? C_HOT : roll < 0.24 ? C_HIGH : roll < 0.8 ? C_BASE : C_DEEP;
    const brightness =
      roll < 0.06 ? 1.6 : roll < 0.24 ? 1.1 : 0.55 + rand() * 0.35;

    for (let s = 0; s <= steps; s++) {
      const th = theta0 + (s / steps) * arcLen;
      const x = (u.x * Math.cos(th) + v.x * Math.sin(th)) * r;
      const y = (u.y * Math.cos(th) + v.y * Math.sin(th)) * r;
      const z = (u.z * Math.cos(th) + v.z * Math.sin(th)) * r;
      pushPoint(sink, rand, x, y, z, color, brightness, 1.0);
    }
  }
}

// Radial spokes — lines from near the core out to the shell, slightly bowed.
function addSpokes(sink: ParticleSink, rand: () => number, count: number) {
  const SPACING = 0.0052;
  for (let i = 0; i < count; i++) {
    const dir = new THREE.Vector3(gaussian(rand), gaussian(rand), gaussian(rand)).normalize();
    const bow = new THREE.Vector3(gaussian(rand), gaussian(rand), gaussian(rand))
      .normalize()
      .multiplyScalar(0.06 + rand() * 0.1);
    const r0 = 0.12 + rand() * 0.15;
    const r1 = 0.55 + rand() * 0.42;
    const steps = Math.max(6, Math.floor((r1 - r0) / SPACING));
    const color = rand() < 0.18 ? C_HIGH : C_BASE;

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const r = r0 + (r1 - r0) * t;
      const sag = Math.sin(t * Math.PI); // bow peaks mid-spoke
      const x = dir.x * r + bow.x * sag;
      const y = dir.y * r + bow.y * sag;
      const z = dir.z * r + bow.z * sag;
      // Spokes fade slightly toward the rim.
      pushPoint(sink, rand, x, y, z, color, 0.95 - t * 0.3, 0.9);
    }
  }
}

// Circuit patches — small dense clusters on the shell surface, like city
// blocks / chip dies. Gives the patchwork density variation from the still.
function addPatches(
  sink: ParticleSink,
  rand: () => number,
  count: number,
  rMin: number,
  rMax: number
) {
  for (let i = 0; i < count; i++) {
    const r = rMin + rand() * (rMax - rMin);
    const center = new THREE.Vector3(gaussian(rand), gaussian(rand), gaussian(rand))
      .normalize()
      .multiplyScalar(r);
    // Tangent plane basis at the patch center.
    const n = center.clone().normalize();
    const tan1 = new THREE.Vector3(0, 1, 0).cross(n);
    if (tan1.lengthSq() < 0.01) tan1.set(1, 0, 0).cross(n);
    tan1.normalize();
    const tan2 = n.clone().cross(tan1);

    const w = 0.03 + rand() * 0.09;
    const h = 0.03 + rand() * 0.09;
    const pts = Math.floor(20 + rand() * 50);
    const color = rand() < 0.25 ? C_HIGH : C_BASE;
    const bright = 0.7 + rand() * 0.5;

    for (let p = 0; p < pts; p++) {
      // Grid-ish placement inside the patch — circuitry, not noise.
      const gx = (Math.floor(rand() * 6) / 6 - 0.5 + rand() * 0.04) * w;
      const gy = (Math.floor(rand() * 6) / 6 - 0.5 + rand() * 0.04) * h;
      const pos = center.clone().addScaledVector(tan1, gx).addScaledVector(tan2, gy);
      pushPoint(sink, rand, pos.x, pos.y, pos.z, color, bright, 0.85);
    }
  }
}

// Core cloud — dense white-hot center.
function addCore(sink: ParticleSink, rand: () => number, count: number) {
  for (let i = 0; i < count; i++) {
    const r = Math.pow(rand(), 2.2) * 0.3;
    const dir = new THREE.Vector3(gaussian(rand), gaussian(rand), gaussian(rand)).normalize();
    const color = r < 0.12 ? C_HOT : C_HIGH;
    pushPoint(
      sink,
      rand,
      dir.x * r,
      dir.y * r,
      dir.z * r,
      color,
      1.3 - r * 1.5,
      1.1
    );
  }
}

function sinkToGeometry(sink: ParticleSink): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(sink.positions), 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(sink.colors), 3));
  geo.setAttribute("aScale", new THREE.BufferAttribute(new Float32Array(sink.scales), 1));
  geo.setAttribute("aRand", new THREE.BufferAttribute(new Float32Array(sink.rands), 1));
  return geo;
}

function buildShells(rand: () => number): {
  outer: THREE.BufferGeometry;
  mid: THREE.BufferGeometry;
  inner: THREE.BufferGeometry;
} {
  const outer: ParticleSink = { positions: [], colors: [], scales: [], rands: [] };
  const mid: ParticleSink = { positions: [], colors: [], scales: [], rands: [] };
  const inner: ParticleSink = { positions: [], colors: [], scales: [], rands: [] };

  // Outer shell — ring fragments + patches near the boundary. Dense weave
  // with visible dark gaps — the film hologram glows but you can see through.
  addArcs(outer, rand, 620, 0.78, 0.97);
  addPatches(outer, rand, 75, 0.8, 0.96);

  // Mid shell — arcs + the radial spoke system.
  addArcs(mid, rand, 460, 0.5, 0.78);
  addSpokes(mid, rand, 175);
  addPatches(mid, rand, 45, 0.52, 0.76);

  // Inner shell — tighter arcs + the white-hot core cloud.
  addArcs(inner, rand, 270, 0.28, 0.5);
  addCore(inner, rand, 3200);

  return {
    outer: sinkToGeometry(outer),
    mid: sinkToGeometry(mid),
    inner: sinkToGeometry(inner),
  };
}

function makeCoreTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,246,224,1)");
  g.addColorStop(0.22, "rgba(255,216,150,0.6)");
  g.addColorStop(0.55, "rgba(245,152,37,0.16)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AtlasOrb({
  state = "idle",
  levelRef,
  capacity = 1,
  size = 300,
  className,
}: AtlasOrbProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<OrbState>(state);
  stateRef.current = state;
  const capacityRef = useRef(capacity);
  capacityRef.current = capacity;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    const dpr = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(size, size);
    renderer.setClearColor(0x000000, 0);
    // Round the canvas itself — WebGL canvases composite on their own GPU
    // layer, so the parent div's border-radius clip can fail in Chromium.
    renderer.domElement.style.borderRadius = "50%";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 10);
    // Sphere spans ~78% of the canvas with swell headroom.
    camera.position.set(0, 0.5, 3.7);
    camera.lookAt(0, 0, 0);

    // Outer group holds a gentle tilt; shells counter-rotate inside it.
    const universe = new THREE.Group();
    universe.rotation.x = 0.18;
    universe.rotation.z = -0.08;
    scene.add(universe);

    const shellOuter = new THREE.Group();
    const shellMid = new THREE.Group();
    const shellInner = new THREE.Group();
    universe.add(shellOuter, shellMid, shellInner);

    const sharedUniforms = {
      uTime: { value: 0 },
      uContract: { value: 0 },
      uAudio: { value: 0 },
      uTurb: { value: 0 },
      uBrightness: { value: 0.92 },
      uRim: { value: 0.32 },
      uCapacity: { value: 1 },
      uPixelRatio: { value: dpr },
    };

    const rand = mulberry32(20260610);
    const shells = buildShells(rand);

    // Two passes per shell: soft glow underneath (big dim points), sharp on
    // top. Same geometry, two materials — cheap bloom without postprocessing.
    const materials: THREE.ShaderMaterial[] = [];
    const makePass = (sizeMul: number, alphaMul: number) => {
      const mat = new THREE.ShaderMaterial({
        vertexShader: FILAMENT_VERT,
        fragmentShader: FILAMENT_FRAG,
        uniforms: {
          ...sharedUniforms,
          uSizeMul: { value: sizeMul },
          uAlphaMul: { value: alphaMul },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      materials.push(mat);
      return mat;
    };

    // Point sizes are in device pixels — scale with canvas size so the
    // filament density reads the same at any orb diameter.
    const sizeScale = size / 300;
    const softMat = makePass(2.8 * sizeScale, 0.032);
    const sharpMat = makePass(1.0 * sizeScale, 0.85);

    for (const [group, geo] of [
      [shellOuter, shells.outer],
      [shellMid, shells.mid],
      [shellInner, shells.inner],
    ] as const) {
      group.add(new THREE.Points(geo, softMat));
      group.add(new THREE.Points(geo, sharpMat));
    }

    // Core glow sprite.
    const coreTexture = makeCoreTexture();
    const core = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: coreTexture,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    core.scale.setScalar(0.3);
    universe.add(core);

    // Animation loop.
    const clock = new THREE.Clock();
    const current = { ...STATE_TARGETS.idle, audio: 0 };
    let raf = 0;
    let hidden = false;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (hidden) return;

      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      const target = STATE_TARGETS[stateRef.current];
      const lerpK = 1 - Math.exp(-3.5 * dt);

      current.brightness += (target.brightness - current.brightness) * lerpK;
      current.spinMul += (target.spinMul - current.spinMul) * lerpK;
      current.contract += (target.contract - current.contract) * lerpK;
      current.turb += (target.turb - current.turb) * lerpK;
      current.rim += (target.rim - current.rim) * lerpK;
      current.core += (target.core - current.core) * lerpK;

      const rawLevel = stateRef.current === "speaking" ? (levelRef?.current ?? 0) : 0;
      const attack = rawLevel > current.audio ? 1 - Math.exp(-30 * dt) : 1 - Math.exp(-8 * dt);
      current.audio += (rawLevel - current.audio) * attack;

      // Capacity drifts slowly — a gauge, not a strobe.
      const capTarget = Math.min(1, Math.max(0, capacityRef.current));
      sharedUniforms.uCapacity.value +=
        (capTarget - sharedUniforms.uCapacity.value) * (1 - Math.exp(-2.0 * dt));

      sharedUniforms.uTime.value = t;
      sharedUniforms.uContract.value = current.contract;
      sharedUniforms.uTurb.value = current.turb;
      sharedUniforms.uBrightness.value = current.brightness;
      sharedUniforms.uRim.value = current.rim;
      sharedUniforms.uAudio.value = current.audio;

      // Core sprite follows the same grade so the heart matches the body.
      const cap = sharedUniforms.uCapacity.value;
      (core.material as THREE.SpriteMaterial).color.setRGB(
        1.0,
        0.34 + 0.66 * cap,
        0.18 + 0.82 * cap
      );
      // Per-pass uniforms share the objects from sharedUniforms, but each
      // material captured its own uSizeMul/uAlphaMul — nothing to sync.

      // Counter-rotating shells. Different axes wobble slightly for life.
      const spin = dt * current.spinMul;
      shellOuter.rotation.y += spin * 0.05;
      shellMid.rotation.y -= spin * 0.075;
      shellMid.rotation.x = Math.sin(t * 0.07) * 0.04;
      shellInner.rotation.y += spin * 0.11;
      shellInner.rotation.z = Math.sin(t * 0.09) * 0.05;

      // Core breathes idle, flickers thinking, pulses with voice.
      const breathe = 1 + Math.sin(t * 0.8) * 0.05;
      const flicker = stateRef.current === "thinking" ? 1 + Math.sin(t * 13.0) * 0.07 : 1;
      core.scale.setScalar(0.3 * current.core * breathe * flicker * (1 + current.audio * 0.4));
      (core.material as THREE.SpriteMaterial).opacity = 0.9 * current.core;

      renderer.render(scene, camera);
    };
    tick();

    const onVisibility = () => {
      hidden = document.hidden;
      if (!hidden) clock.getDelta();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      shells.outer.dispose();
      shells.mid.dispose();
      shells.inner.dispose();
      for (const m of materials) m.dispose();
      (core.material as THREE.SpriteMaterial).dispose();
      coreTexture.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
    // size is fixed per mount; state flows via stateRef without re-init.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  return (
    <div
      ref={mountRef}
      className={className}
      style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden" }}
      aria-hidden
    />
  );
}
