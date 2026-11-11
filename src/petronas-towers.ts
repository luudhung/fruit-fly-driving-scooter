import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const TOWER_HEIGHT = 115;
const BRIDGE_HEIGHT = 43.2;
const TOWER_OFFSET = 3.03;
const OUTLINE = Array.from({ length: 32 }, (_, index) => {
  const angle = index * Math.PI / 16;
  const radius = [1, 0.79, 0.86, 0.79][index % 4];
  return new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius);
});

// The city uses a compressed parcel width. Keep the height proportions and
// double-deck bridge level of the reference while fitting the existing lot.
const SETBACKS = [
  [4.8, 2.40], [30, 2.40], [52, 2.22], [66, 1.99],
  [77, 1.74], [85, 1.47], [91, 1.22], [96, 1.00], [99, 0.76],
] as const;

function uplightTexture() {
  const stops = [
    [0, 0x23063b], [6, 0x9b22ff], [29, 0x7920d6], [46, 0xa314ea],
    [55, 0xe324a7], [62, 0x840749], [65, 0xff1738], [77, 0x9d1526],
    [81, 0xff8c29], [91, 0x9f4c16], [94, 0x30f551], [104, 0x126326],
    [108, 0x89ff9e], [112, 0x347049], [115, 0xc5ffe2],
  ].map(([height, hex]) => ({ height, color: new THREE.Color(hex) }));
  const pixels = new Uint8Array(256 * 4);
  const color = new THREE.Color();
  let band = 0;
  for (let index = 0; index < 256; index++) {
    const height = index / 255 * TOWER_HEIGHT;
    while (band + 1 < stops.length - 1 && height > stops[band + 1].height) band++;
    const low = stops[band], high = stops[band + 1];
    color.copy(low.color).lerp(high.color, (height - low.height) / (high.height - low.height));
    color.convertLinearToSRGB();
    pixels.set([color.r * 255, color.g * 255, color.b * 255, 255], index * 4);
  }
  const texture = new THREE.DataTexture(pixels, 1, 256, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

const glow = uplightTexture();
const glazing = new THREE.MeshStandardMaterial({
  color: 0x3e5265, roughness: 0.29, metalness: 0.43, emissive: 0xffffff, emissiveMap: glow,
});
const stainless = new THREE.MeshStandardMaterial({
  color: 0xb9c5cb, roughness: 0.32, metalness: 0.53, emissive: 0xffffff, emissiveMap: glow,
});
const stone = new THREE.MeshStandardMaterial({ color: 0xa8a6aa, roughness: 0.82 });

export function updatePetronasLighting(night: number) {
  const amount = THREE.MathUtils.smoothstep(night, 0.15, 0.93);
  glazing.emissiveIntensity = amount * 0.78;
  stainless.emissiveIntensity = amount * 1.8;
}
updatePetronasLighting(0);

function starShell(x: number, z: number, bottom: number, top: number, radius: number, topRadius = radius, capped = true) {
  const vertices: number[] = [];
  const point = (p: THREE.Vector2, y: number, r: number) => [x + p.x * r, y, z + p.y * r];
  for (let index = 0; index < OUTLINE.length; index++) {
    const a = OUTLINE[index], b = OUTLINE[(index + 1) % OUTLINE.length];
    const lowerA = point(a, bottom, radius), lowerB = point(b, bottom, radius);
    const upperA = point(a, top, topRadius), upperB = point(b, top, topRadius);
    vertices.push(...lowerA, ...upperA, ...lowerB, ...upperA, ...upperB, ...lowerB);
    if (capped) vertices.push(x, top, z, ...upperB, ...upperA);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function addBox(parts: THREE.BufferGeometry[], x: number, y: number, z: number, w: number, h: number, d: number) {
  parts.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
}

function addBrace(parts: THREE.BufferGeometry[], start: THREE.Vector3, end: THREE.Vector3) {
  const direction = end.clone().sub(start);
  const geometry = new THREE.CylinderGeometry(0.072, 0.072, direction.length(), 6);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
  geometry.translate(...start.clone().lerp(end, 0.5).toArray());
  parts.push(geometry);
}

function addBatch(root: THREE.Group, parts: THREE.BufferGeometry[], material: THREE.Material) {
  const triangles = parts.map(part => part.index ? part.toNonIndexed() : part);
  for (const part of triangles) {
    const positions = part.getAttribute("position");
    const uv = new Float32Array(positions.count * 2);
    for (let index = 0; index < positions.count; index++) {
      uv[index * 2] = 0.5;
      uv[index * 2 + 1] = positions.getY(index) / TOWER_HEIGHT;
    }
    part.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  }
  const geometry = mergeGeometries(triangles);
  if (!geometry) throw new Error("Unable to batch Petronas tower geometry");
  root.add(new THREE.Mesh(geometry, material));
  for (const part of new Set([...parts, ...triangles])) part.dispose();
}

export function buildPetronasTowers(
  plot: { x: number; z: number },
  makeSign: (text: string, width: number, height: number) => THREE.Sprite,
) {
  const group = new THREE.Group();
  group.position.set(plot.x, 0, plot.z);
  const panes: THREE.BufferGeometry[] = [], steel: THREE.BufferGeometry[] = [], base: THREE.BufferGeometry[] = [];
  addBox(base, 0, 0.35, 0, 11, 0.7, 11.8);
  addBox(base, 0, 2.75, 0.65, 10.8, 4.1, 7.6);
  addBox(panes, 0, 2.6, -3.2, 4.2, 3.2, 0.24);
  addBox(steel, 0, 4.72, 0.65, 10.9, 0.24, 7.8);

  for (const side of [-1, 1]) {
    const x = side * TOWER_OFFSET;
    for (let index = 1; index < SETBACKS.length; index++) {
      const bottom = SETBACKS[index - 1][0];
      const [top, radius] = SETBACKS[index];
      panes.push(starShell(x, 0, bottom, top, radius));
      steel.push(starShell(x, 0, top - 0.4, top, radius + 0.06, radius + 0.015));
      // Reflective steel bands mark the floors on every face of the star.
      for (let floor = Math.ceil(bottom); floor < top - 0.15; floor++) {
        steel.push(starShell(x, 0, floor, floor + 0.10, radius + 0.035, radius, false));
      }
      for (let corner = 0; corner < OUTLINE.length; corner += 4) {
        const p = OUTLINE[corner];
        addBox(steel, x + p.x * radius, (bottom + top) / 2, p.y * radius, 0.075, top - bottom, 0.075);
      }
    }
    // The lower annex steps down behind each main shaft.
    for (const [y, h, r] of [[4.8, 24, 0.99], [28.8, 11, 0.82], [39.8, 5.2, 0.64]]) {
      panes.push(starShell(x, 2.4, y, y + h, r));
      for (let floor = Math.ceil(y); floor < y + h; floor++) {
        steel.push(starShell(x, 2.4, floor, floor + 0.09, r + 0.03, r, false));
      }
    }
    steel.push(starShell(x, 0, 99, 103, 0.76, 0.28));
    for (const [height, radius] of [[99.6, 0.73], [100.8, 0.60], [102, 0.45]]) {
      steel.push(starShell(x, 0, height, height + 0.14, radius, radius - 0.03, false));
    }
    steel.push(new THREE.CylinderGeometry(0.05, 0.24, 12, 8).translate(x, 109, 0));
    steel.push(new THREE.SphereGeometry(0.20, 8, 5).translate(x, 107.4, 0));
    for (const z of [-0.64, 0.64]) {
      addBrace(steel, new THREE.Vector3(side * 2.45, 34.0, z), new THREE.Vector3(side * 0.28, BRIDGE_HEIGHT, z));
    }
  }

  addBox(panes, 0, BRIDGE_HEIGHT + 0.78, 0, 6.1, 1.5, 1.42);
  for (const height of [0, 0.78, 1.56]) {
    addBox(steel, 0, BRIDGE_HEIGHT + height, 0, 6.2, 0.09, 1.55);
  }
  for (const z of [-0.74, 0.74]) for (let x = -1.35; x <= 1.36; x += 0.27) {
    addBox(steel, x, BRIDGE_HEIGHT + 0.8, z, 0.045, 1.58, 0.05);
  }
  addBatch(group, base, stone);
  addBatch(group, panes, glazing);
  addBatch(group, steel, stainless);

  const sign = makeSign("HANSDREX PETRONAS", 22, 1.15);
  sign.position.y = 119;
  group.add(sign);
  return group;
}
