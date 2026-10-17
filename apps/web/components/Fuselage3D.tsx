"use client";
// The 737 fuselage in 3D, for viewers who don't know aircraft. Same geometry as the flat map:
// 28 stringers a side (S-1 at the crown), a frame every 20 inches of body station, and the
// map's heat on the skin. "Unroll" cuts the skin along the bottom and flattens it into the
// map's layout: nose on the left, right side on top. Simplified shapes, not a CAD model.
// Loaded with next/dynamic (no SSR): three.js needs the browser.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { BIN, BS_MAX, BS_MIN, STRINGERS, SWA812, heat } from "../lib/fuselage";
import { TERMS } from "../lib/glossary";
import type { Cell } from "./FuselageMap";

const R0 = 74;                  // 737 fuselage radius, inches (148 in wide)
const MID = (BS_MIN + BS_MAX) / 2;
const D = Math.PI / STRINGERS;  // angle between stringers
const NOSE = 130, TAIL = 1217;  // body stations of the nose tip and the tail cone end (approx.)
const S = 0.01;                 // scene units per inch
const ROUND = new THREE.Vector3(-8.2, 4.0, 9.0), FLAT = new THREE.Vector3(0, 11.3, 0.001);

/** Fuselage radius at a body station: round nose, constant barrel, tapering tail cone. */
function radiusAt(b: number) {
  if (b < 360) return R0 * Math.sqrt(Math.max(0, 1 - ((360 - b) / (360 - NOSE)) ** 2));
  if (b > 1016) return R0 * (1 - 0.85 * ((b - 1016) / (TAIL - 1016)) ** 1.5);
  return R0;
}
/** Signed angle from the crown to the middle of stringer n: left side positive. */
const angle = (side: "L" | "R", n: number) => (side === "L" ? 1 : -1) * (n - 0.5) * D;

/** The skin point at body station b and angle th, t of the way unrolled (0 round, 1 flat);
 *  the skin curls open around the crown line, which stays put. Also returns the outward normal. */
function place(b: number, th: number, t: number, lift = 0, out = new THREE.Vector3(), normal?: THREE.Vector3) {
  const r = radiusAt(b) + lift, flat = R0 + lift, k = Math.max(1 - t, 1e-4);
  const s = (r * (1 - t) + flat * t) * th, rt = r / k, phi = s / rt;
  normal?.set(0, Math.cos(phi), Math.sin(phi));
  return out.set((b - MID) * S, (r * (1 - t) + flat * t - rt * (1 - Math.cos(phi))) * S, rt * Math.sin(phi) * S);
}

/** Geometry whose vertices live on the skin: [b, th, lift] per vertex, re-placed as t changes. */
interface Morph { geo: THREE.BufferGeometry; params: number[] }
function morph(params: number[], index?: number[], colors?: number[]): Morph {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(params.length), 3));
  if (colors) geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3));
  if (index) geo.setIndex(index);
  return { geo, params };
}
const v = new THREE.Vector3();
function apply(m: Morph, t: number) {
  const p = m.geo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { place(m.params[3 * i], m.params[3 * i + 1], t, m.params[3 * i + 2], v); p.setXYZ(i, v.x, v.y, v.z); }
  p.needsUpdate = true;
  m.geo.computeBoundingSphere();
}
/** A wide line along the skin (LineGeometry needs plain positions). */
function wide(points: Array<[number, number, number]>, t: number) {
  return points.flatMap(([b, th, lift]) => place(b, th, t, lift, v).toArray());
}
const span = (a: number, b: number, step: number) => Array.from({ length: Math.round((b - a) / step) + 1 }, (_, i) => a + i * step);

interface Label { text: string; tip: string; at: (t: number, n: THREE.Vector3) => THREE.Vector3; show: (t: number) => number }
const onSkin = (b: number, th: number, lift = 3) => (t: number, n: THREE.Vector3) => place(b, th, t, lift, new THREE.Vector3(), n);
const fixed = (x: number, y: number, z: number) => (_t: number, n: THREE.Vector3) => { n.set(0, 0, 0); return new THREE.Vector3((x - MID) * S, y * S, z * S); };
const LABELS: Label[] = [
  { text: "Nose", tip: "The front of the aircraft. Body stations count back from here.", at: fixed(NOSE - 20, 0, 0), show: () => 1 },
  { text: "Tail", tip: "The back of the aircraft.", at: fixed(TAIL + 30, 40, 0), show: () => 1 },
  { text: "Wing", tip: "The wings join the fuselage below the floor, under the panel that tore.", at: fixed(770, 20, 560), show: (t) => 1 - t * 3 },
  { text: "Crown, the top", tip: TERMS.crown, at: onSkin(300, 0), show: () => 1 },
  { text: "Stringer S-4L", tip: TERMS.stringer, at: onSkin(940, angle("L", 4)), show: () => 1 },
  { text: "Frame at body station 900", tip: `${TERMS.bodyStation} A frame is a hoop that holds the fuselage round; there is one every 20 inches.`, at: onSkin(900, 1.3), show: () => 1 },
  { text: "Panel that tore on Southwest 812", tip: TERMS.panel, at: onSkin(600, angle("L", 4) + D * 2.4, 4), show: () => 1 },
  { text: "Right side", tip: TERMS.sides, at: onSkin(230, -Math.PI / 2), show: (t) => t * 2 - 1 },
  { text: "Left side", tip: TERMS.sides, at: onSkin(230, Math.PI / 2), show: (t) => t * 2 - 1 },
];

export function Fuselage3D({ cells }: { cells: Cell[] }) {
  const box = useRef<HTMLDivElement>(null), host = useRef<HTMLDivElement>(null);
  const labels = useRef<Array<HTMLSpanElement | null>>([]);
  const api = useRef<{ setCells: (c: Cell[]) => void; unroll: (flat: boolean) => void } | null>(null);
  const [flat, setFlat] = useState(false);

  useEffect(() => {
    const el = box.current!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    host.current!.append(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 2, 0.1, 100);
    camera.position.copy(ROUND);
    const controls = new OrbitControls(camera, renderer.domElement);
    Object.assign(controls, { enableZoom: false, enablePan: false, enableDamping: true, autoRotate: !reduced, autoRotateSpeed: 0.6 });
    controls.addEventListener("start", () => { controls.autoRotate = false; });
    const disposables: Array<{ dispose: () => void }> = [renderer, controls];
    const keep = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x);

    // skin: translucent, so the frames and stringers behind it read as a skeleton
    const skinP: number[] = [], skinI: number[] = [];
    const bs = span(BS_MIN, BS_MAX, BIN), ths = span(-Math.PI, Math.PI, D / 2);
    for (const b of bs) for (const th of ths) skinP.push(b, th, -0.4);
    for (let i = 0; i < bs.length - 1; i++) for (let j = 0; j < ths.length - 1; j++) {
      const a = i * ths.length + j, c = a + ths.length;
      skinI.push(a, c, a + 1, a + 1, c, c + 1);
    }
    const skin = morph(skinP, skinI);
    scene.add(new THREE.Mesh(skin.geo, keep(new THREE.MeshBasicMaterial({ color: "#D6DDE3", transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }))));
    // frames every 20 in (darker every 100) and the 56 stringers
    const lineP: number[] = [], lineC: number[] = [];
    const dark = new THREE.Color("#8F9BA6"), light = new THREE.Color("#C3CCD4"), str = new THREE.Color("#A7B2BC");
    for (const b of bs) for (let j = 0; j < ths.length - 1; j++) {
      lineP.push(b, ths[j], 0, b, ths[j + 1], 0);
      const c = b % 100 === 0 ? dark : light;
      lineC.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    for (const side of ["L", "R"] as const) for (let n = 1; n <= STRINGERS; n++) for (let i = 0; i < bs.length - 1; i++) {
      lineP.push(bs[i], angle(side, n), 0.2, bs[i + 1], angle(side, n), 0.2);
      lineC.push(str.r, str.g, str.b, str.r, str.g, str.b);
    }
    const lines = morph(lineP, undefined, lineC);
    scene.add(new THREE.LineSegments(lines.geo, keep(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }))));

    // Southwest 812: the rupture (filled), the crown panel outline and stringer S-4L
    const tear = morph([[663, 3.5], [727, 3.5], [663, 4.5], [727, 4.5]].flatMap(([b, k]) => [b, k * D, 1.2]), [0, 2, 1, 1, 2, 3]);
    scene.add(new THREE.Mesh(tear.geo, keep(new THREE.MeshBasicMaterial({ color: "#FF4F00", side: THREE.DoubleSide }))));
    const { crown } = SWA812;
    const panelPts: Array<[number, number, number]> = [
      ...span(crown.from, crown.to, 17).map((b): [number, number, number] => [b, -3.5 * D, 1.6]),
      ...span(-3.5, 3.5, 0.5).map((k): [number, number, number] => [crown.to, k * D, 1.6]),
      ...span(crown.from, crown.to, 17).reverse().map((b): [number, number, number] => [b, 3.5 * D, 1.6]),
      ...span(-3.5, 3.5, 0.5).reverse().map((k): [number, number, number] => [crown.from, k * D, 1.6]),
    ];
    const s4lPts = bs.map((b): [number, number, number] => [b, angle("L", 4), 1]);
    const ink = keep(new LineMaterial({ color: 0x161513, linewidth: 2.5 }));
    const panel = new Line2(keep(new LineGeometry()), ink), s4l = new Line2(keep(new LineGeometry()), ink);
    scene.add(panel, s4l);

    // heat: the map's cells on the skin
    const heatMat = keep(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 }));
    let heatMesh: THREE.Mesh | null = null, heatM: Morph | null = null;
    let t = 0, target = 0;
    const setCells = (cs: Cell[]) => {
      if (heatMesh) { scene.remove(heatMesh); heatM!.geo.dispose(); }
      const p: number[] = [], c: number[] = [], idx: number[] = [];
      for (const cell of cs) {
        const n = Number(cell.stringer);
        if (!(n >= 1 && n <= STRINGERS) || cell.station < BS_MIN || cell.station >= BS_MAX) continue;
        const sg = cell.side === "L" ? 1 : -1, col = new THREE.Color(heat(cell.aircraft)), k = p.length / 3;
        for (const [b, a] of [[cell.station, n - 1], [cell.station + BIN, n - 1], [cell.station, n], [cell.station + BIN, n]]) { p.push(b, sg * a * D, 0.5); c.push(col.r, col.g, col.b); }
        idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
      heatM = morph(p, idx, c);
      apply(heatM, t);
      heatMesh = new THREE.Mesh(heatM.geo, heatMat);
      scene.add(heatMesh);
    };

    // context, faded out as the skin unrolls: nose and tail cones, wings, engines, tail surfaces
    const ghost = keep(new THREE.MeshBasicMaterial({ color: "#73716C", transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }));
    const ghostEdge = keep(new THREE.LineBasicMaterial({ color: "#73716C", transparent: true, opacity: 0.45 }));
    const context = new THREE.Group();
    const lathe = (from: number, to: number) => {
      const g = keep(new THREE.LatheGeometry(span(from, to, 10).map((b) => new THREE.Vector2(radiusAt(b) * S, (b - MID) * S)), 48));
      g.rotateZ(-Math.PI / 2);
      return g;
    };
    const flatPart = (pts: number[][]) => { // [b, y, z] corners, inches
      const g = keep(new THREE.BufferGeometry().setFromPoints(pts.map(([b, y, z]) => new THREE.Vector3((b - MID) * S, y * S, z * S))));
      g.setIndex(pts.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2]);
      return g;
    };
    const parts: THREE.BufferGeometry[] = [lathe(NOSE, BS_MIN), lathe(BS_MAX, TAIL)];
    for (const z of [1, -1]) {
      parts.push(flatPart([[500, -40, 70 * z], [690, -40, 70 * z], [792, 12, 568 * z], [732, 12, 568 * z]])); // wing
      parts.push(flatPart([[1060, 20, 30 * z], [1160, 20, 30 * z], [1222, 30, 245 * z], [1180, 30, 245 * z]])); // horizontal tail
      // engine: hung just under the wing, mostly ahead of it
      const eng = keep(new THREE.CylinderGeometry(30 * S, 26 * S, 170 * S, 24, 1, true));
      eng.rotateZ(Math.PI / 2).translate((500 - MID) * S, -58 * S, 190 * z * S);
      parts.push(eng);
    }
    parts.push(flatPart([[985, 60, 0], [1185, 28, 0], [1222, 290, 0], [1150, 290, 0]])); // fin
    for (const g of parts) { context.add(new THREE.Mesh(g, ghost)); context.add(new THREE.LineSegments(keep(new THREE.EdgesGeometry(g, 25)), ghostEdge)); }
    scene.add(context);

    const update = () => {
      apply(skin, t); apply(lines, t); apply(tear, t); if (heatM) apply(heatM, t);
      (panel.geometry as LineGeometry).setPositions(wide(panelPts, t)); (s4l.geometry as LineGeometry).setPositions(wide(s4lPts, t));
      ghost.opacity = 0.13 * (1 - t) ** 2; ghostEdge.opacity = 0.45 * (1 - t) ** 2; context.visible = t < 0.98;
    };
    update();
    setCells(cells);

    let from = ROUND.clone(), p0 = 0;
    api.current = { setCells, unroll: (f) => { target = f ? 1 : 0; from = camera.position.clone(); p0 = t; controls.autoRotate = false; if (reduced) { t = target; camera.position.copy(f ? FLAT : ROUND); update(); } } };

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); ink.resolution.set(w, h);
    };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    const n = new THREE.Vector3(), toCam = new THREE.Vector3(), dirTo = new THREE.Vector3();
    let raf = 0, last = performance.now();
    const loop = (now = performance.now()) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(100, now - last);
      last = now;
      if (t !== target) {
        const dir = Math.sign(target - t);
        t = Math.min(1, Math.max(0, t + (dir * dt) / 1600)); // 1.6 s either way
        const e = Math.abs(t - p0) / Math.max(1e-6, Math.abs(target - p0)), ease = e * e * (3 - 2 * e);
        // swing around the aircraft (direction and distance eased separately), never through it
        const to = target ? FLAT : ROUND;
        camera.position.copy(from).normalize().lerp(dirTo.copy(to).normalize(), ease).normalize().multiplyScalar(from.length() + (to.length() - from.length()) * ease);
        update();
      }
      controls.update();
      renderer.render(scene, camera);
      const w = el.clientWidth, h = el.clientHeight;
      LABELS.forEach((l, i) => {
        const tag = labels.current[i];
        if (!tag) return;
        const at = l.at(t, n);
        const facing = n.lengthSq() === 0 || n.dot(toCam.copy(camera.position).sub(at)) > 0;
        at.project(camera);
        const o = facing ? Math.max(0, Math.min(1, l.show(t))) : 0;
        tag.style.opacity = String(o);
        tag.style.visibility = o > 0.05 ? "visible" : "hidden";
        tag.style.transform = `translate(${((at.x + 1) / 2) * w}px, ${((1 - at.y) / 2) * h}px) translate(-50%, -50%)`;
      });
    };
    loop();
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      for (const m of [skin, lines, tear, heatM]) m?.geo.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.domElement.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { api.current?.setCells(cells); }, [cells]);

  return (
    <div className="f3d" ref={box}>
      <div className="f3d-canvas" ref={host} />
      {LABELS.map((l, i) => <span key={l.text} ref={(e) => { labels.current[i] = e; }} className="f3d-label term" data-tip={l.tip}>{l.text}</span>)}
      <div className="f3d-bar">
        <button className="go" onClick={() => { setFlat(!flat); api.current?.unroll(!flat); }}>{flat ? "Roll it back up" : "Unroll it into the map"}</button>
        <span className="caption">{flat ? "Cut along the bottom and laid flat: this is the map. Nose on the left, right side on top." : "A simplified 737. Drag to turn it. Colour shows the same reports as the map."}</span>
      </div>
    </div>
  );
}
