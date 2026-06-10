"use client";

// AtlasOrb — the observable universe in a sphere.
//
// A GPU particle galaxy (3-arm logarithmic spiral, ~42k particles, differential
// rotation — inner stars orbit faster) plus a volumetric halo star field,
// contained inside a fresnel-rimmed glass boundary. Sits on the Oracle page as
// Atlas's physical presence; later phases drive it with live voice audio.
//
// States (smoothly lerped uniforms, never a hard cut):
//   idle      — slow swirl, calm brightness, gentle core breathing
//   listening — brightens, rotation eases, slight inward contraction (attentive)
//   thinking  — rotation speeds up ~3.4×, turbulence ripples the arms
//   speaking  — audio level drives radial swell + brightness pulse
//
// Audio: pass `levelRef` (a mutable ref holding 0..1). The render loop reads
// it every frame — no React re-renders in the hot path. V2 wires this to an
// AnalyserNode on the ElevenLabs output stream.

import { useEffect, useRef } from "react";
import * as THREE from "three";

export type OrbState = "idle" | "listening" | "thinking" | "speaking";

interface AtlasOrbProps {
  state?: OrbState;
  /** Mutable 0..1 audio level, read per-frame (no re-renders). */
  levelRef?: React.MutableRefObject<number>;
  /** Canvas square size in px. */
  size?: number;
  className?: string;
}

// Per-state shader uniform targets. Lerped at ~3.5/s for liquid transitions.
const STATE_TARGETS: Record<
  OrbState,
  { brightness: number; spinMul: number; contract: number; turb: number; rim: number; core: number }
> = {
  idle: { brightness: 0.9, spinMul: 1.0, contract: 0.0, turb: 0.0, rim: 0.5, core: 0.7 },
  listening: { brightness: 1.3, spinMul: 0.55, contract: 1.0, turb: 0.0, rim: 1.05, core: 1.0 },
  thinking: { brightness: 1.12, spinMul: 3.4, contract: 0.3, turb: 1.0, rim: 0.8, core: 1.15 },
  speaking: { brightness: 1.35, spinMul: 1.35, contract: 0.0, turb: 0.12, rim: 1.15, core: 1.2 },
};

// Mulberry32 — tiny seeded PRNG so the galaxy is identical every visit.
// Atlas should feel like the same celestial object, not a re-roll.
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
  // Box-Muller
  const u = Math.max(rand(), 1e-9);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const DISK_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uSpinMul;
  uniform float uContract;
  uniform float uAudio;
  uniform float uTurb;
  uniform float uPixelRatio;
  attribute float aScale;
  attribute vec3 aColor;
  attribute float aRand;
  varying vec3 vColor;

  void main() {
    vec3 pos = position;
    float r = length(pos.xz);

    // Non-accumulating differential shear — oscillates instead of winding, so
    // the spiral arms stay crisp forever. (True differential rotation winds
    // the arms into concentric rings within a minute; rigid rotation happens
    // on the parent group in JS.)
    float angle = atan(pos.z, pos.x);
    angle += sin(uTime * 0.25 + r * 7.0) * 0.035 * uSpinMul;
    pos.x = cos(angle) * r;
    pos.z = sin(angle) * r;

    // Thinking turbulence — cheap per-particle phase noise.
    pos += uTurb * 0.05 * vec3(
      sin(uTime * 2.1 + aRand * 37.0),
      sin(uTime * 1.7 + aRand * 23.0) * 0.6,
      cos(uTime * 2.3 + aRand * 51.0)
    );

    // Speaking swell — radial push, slightly desynced per particle so the
    // surface shimmers instead of breathing as one rigid body.
    float swell = 1.0 + uAudio * 0.16 * (0.45 + 0.55 * sin(aRand * 40.0 + uTime * 9.0));
    pos *= swell;

    // Listening contraction — pulls the whole field inward ~4%.
    pos *= 1.0 - uContract * 0.04;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aScale * uPixelRatio * (5.4 / -mv.z);
    vColor = aColor;
  }
`;

const DISK_FRAG = /* glsl */ `
  uniform float uBrightness;
  varying vec3 vColor;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float alpha = pow(smoothstep(0.5, 0.0, d), 1.6);
    gl_FragColor = vec4(vColor * uBrightness, alpha);
  }
`;

const HALO_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uAudio;
  uniform float uPixelRatio;
  attribute float aScale;
  attribute float aRand;
  varying float vTwinkle;

  void main() {
    vec3 pos = position;
    // Barely-there counter-rotation so the halo feels independent of the disk.
    float r = length(pos.xz);
    float angle = atan(pos.z, pos.x) - uTime * 0.012;
    pos.x = cos(angle) * r;
    pos.z = sin(angle) * r;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aScale * uPixelRatio * (3.2 / -mv.z);
    // Highs make the deep-field stars twinkle harder while speaking.
    vTwinkle = 0.55 + 0.45 * sin(uTime * (1.5 + aRand * 3.0) + aRand * 80.0) * (1.0 + uAudio * 1.5);
  }
`;

const HALO_FRAG = /* glsl */ `
  uniform float uBrightness;
  varying float vTwinkle;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float alpha = pow(smoothstep(0.5, 0.0, d), 2.0) * vTwinkle;
    gl_FragColor = vec4(vec3(0.62, 0.72, 0.86) * uBrightness, alpha * 0.5);
  }
`;

// Inner void — the deep-space backdrop that makes the universe read as INSIDE
// a sphere even on a light dashboard. BackSide so we see its inner surface.
const VOID_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const VOID_FRAG = /* glsl */ `
  void main() {
    // Deep indigo-black, slightly lifted at the center for nebular depth.
    gl_FragColor = vec4(0.012, 0.016, 0.038, 0.97);
  }
`;

// Fresnel rim — the "glass" of the observable universe.
const RIM_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const RIM_FRAG = /* glsl */ `
  uniform float uRim;
  uniform float uAudio;
  varying vec3 vNormal;
  varying vec3 vView;

  void main() {
    float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 3.2);
    // Brand-teal rim cooled toward starlight blue.
    vec3 rimColor = mix(vec3(0.0, 0.72, 0.72), vec3(0.55, 0.78, 1.0), 0.45);
    float strength = fres * uRim * (1.0 + uAudio * 0.5);
    gl_FragColor = vec4(rimColor * strength, strength * 0.85);
  }
`;

function buildGalaxy(rand: () => number) {
  const COUNT = 42000;
  const ARMS = 3;
  const R_DISK = 0.92;

  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);
  const scales = new Float32Array(COUNT);
  const rands = new Float32Array(COUNT);

  // Palette: white-gold core → brand teal arms → deep indigo rim.
  const cCore = new THREE.Color("#fff3d6");
  const cMid = new THREE.Color("#27c8c8");
  const cOuter = new THREE.Color("#2a3a8c");

  for (let i = 0; i < COUNT; i++) {
    // Radial distribution — gentler core bias so the arms keep enough stars
    // to read as structure instead of one bright blob.
    const r = Math.pow(rand(), 1.35) * R_DISK;
    const armIndex = i % ARMS;

    // Logarithmic spiral: angle grows with log(r). 2.35 = arm tightness.
    const armAngle = (armIndex / ARMS) * Math.PI * 2 + Math.log(r + 0.08) * 2.35;

    // Tight scatter keeps the arms crisp edge to edge.
    const scatter = gaussian(rand) * (0.04 + r * 0.09);
    const angle = armAngle + scatter;

    // Disk thickness — thin, thinner at the edge.
    const y = gaussian(rand) * 0.045 * (1.0 - r * 0.55);

    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    // Color ramp by radius + per-star variance.
    const t = r / R_DISK;
    const col = new THREE.Color();
    if (t < 0.32) {
      col.lerpColors(cCore, cMid, t / 0.32);
    } else {
      col.lerpColors(cMid, cOuter, (t - 0.32) / 0.68);
    }
    const variance = 0.85 + rand() * 0.45;
    colors[i * 3] = col.r * variance;
    colors[i * 3 + 1] = col.g * variance;
    colors[i * 3 + 2] = col.b * variance;

    // Core stars render slightly larger.
    scales[i] = (0.5 + rand() * 0.9) * (t < 0.25 ? 1.5 : 1.0);
    rands[i] = rand();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));
  geo.setAttribute("aRand", new THREE.BufferAttribute(rands, 1));
  return geo;
}

function buildHalo(rand: () => number) {
  const COUNT = 6500;
  const positions = new Float32Array(COUNT * 3);
  const scales = new Float32Array(COUNT);
  const rands = new Float32Array(COUNT);

  for (let i = 0; i < COUNT; i++) {
    // Uniform-in-volume, biased toward the shell so the void reads deep.
    const r = Math.cbrt(rand()) * 0.97;
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    scales[i] = 0.3 + rand() * 0.55;
    rands[i] = rand();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));
  geo.setAttribute("aRand", new THREE.BufferAttribute(rands, 1));
  return geo;
}

function makeCoreTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,244,214,1)");
  g.addColorStop(0.25, "rgba(255,236,190,0.55)");
  g.addColorStop(0.6, "rgba(120,220,220,0.12)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function AtlasOrb({ state = "idle", levelRef, size = 300, className }: AtlasOrbProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<OrbState>(state);
  stateRef.current = state;

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
    // Far enough back that the full sphere silhouette (plus swell headroom)
    // fits inside the square canvas — sphere spans ~78% of it.
    camera.position.set(0, 0.64, 3.7);
    camera.lookAt(0, 0, 0);

    // Outer group holds the tilt; inner "spinner" carries the rigid disk
    // rotation so spinning happens in the disk plane, not world Y.
    const universe = new THREE.Group();
    universe.rotation.x = 0.42;
    universe.rotation.z = -0.12;
    scene.add(universe);

    const spinner = new THREE.Group();
    universe.add(spinner);

    const uniforms = {
      uTime: { value: 0 },
      uSpinMul: { value: 1 },
      uContract: { value: 0 },
      uAudio: { value: 0 },
      uTurb: { value: 0 },
      uBrightness: { value: 0.9 },
      uRim: { value: 0.5 },
      uPixelRatio: { value: dpr },
    };

    const rand = mulberry32(20260610);

    // 1. The void — deep space inside the sphere.
    const voidMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.0, 48, 48),
      new THREE.ShaderMaterial({
        vertexShader: VOID_VERT,
        fragmentShader: VOID_FRAG,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
      })
    );
    universe.add(voidMesh);

    // 2. Halo deep-field stars.
    const haloMat = new THREE.ShaderMaterial({
      vertexShader: HALO_VERT,
      fragmentShader: HALO_FRAG,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const halo = new THREE.Points(buildHalo(rand), haloMat);
    spinner.add(halo);

    // 3. The galaxy disk.
    const diskMat = new THREE.ShaderMaterial({
      vertexShader: DISK_VERT,
      fragmentShader: DISK_FRAG,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const disk = new THREE.Points(buildGalaxy(rand), diskMat);
    spinner.add(disk);

    // 4. Core glow sprite.
    const coreTexture = makeCoreTexture();
    const core = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: coreTexture,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    core.scale.setScalar(0.34);
    spinner.add(core);

    // 5. Fresnel rim — the glass boundary.
    const rim = new THREE.Mesh(
      new THREE.SphereGeometry(1.0, 64, 64),
      new THREE.ShaderMaterial({
        vertexShader: RIM_VERT,
        fragmentShader: RIM_FRAG,
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    scene.add(rim);

    // Animation loop with smooth state lerping.
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

      // Audio is fast-attack, slower-release so speech feels punchy.
      const rawLevel = stateRef.current === "speaking" ? (levelRef?.current ?? 0) : 0;
      const attack = rawLevel > current.audio ? 1 - Math.exp(-30 * dt) : 1 - Math.exp(-8 * dt);
      current.audio += (rawLevel - current.audio) * attack;

      uniforms.uTime.value = t;
      uniforms.uSpinMul.value = current.spinMul;
      uniforms.uContract.value = current.contract;
      uniforms.uTurb.value = current.turb;
      uniforms.uBrightness.value = current.brightness;
      uniforms.uRim.value = current.rim;
      uniforms.uAudio.value = current.audio;

      // Rigid disk-plane rotation — arms never wind. ~75s per revolution
      // idle; thinking spins ~3.4× faster via spinMul.
      spinner.rotation.y += dt * 0.085 * current.spinMul;

      // Core breathes idle, flickers thinking, pulses with voice.
      const breathe = 1 + Math.sin(t * 0.8) * 0.05;
      const flicker = stateRef.current === "thinking" ? 1 + Math.sin(t * 13.0) * 0.06 : 1;
      core.scale.setScalar(0.34 * current.core * breathe * flicker * (1 + current.audio * 0.35));
      (core.material as THREE.SpriteMaterial).opacity = 0.85 * current.core;

      renderer.render(scene, camera);
    };
    tick();

    const onVisibility = () => {
      hidden = document.hidden;
      if (!hidden) clock.getDelta(); // swallow the gap so dt doesn't spike
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      disk.geometry.dispose();
      halo.geometry.dispose();
      voidMesh.geometry.dispose();
      rim.geometry.dispose();
      diskMat.dispose();
      haloMat.dispose();
      (voidMesh.material as THREE.Material).dispose();
      (rim.material as THREE.Material).dispose();
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
