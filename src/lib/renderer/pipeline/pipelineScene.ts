import * as THREE from 'three';

export type PipelineSceneState = {
  object: boolean;
  solid: boolean;
  wire: boolean;
  axes: boolean;
  light: boolean;
  camera: boolean;
  screen: boolean;
  raster: boolean;
  grid: boolean;
  position: [number, number, number];
  scale: number;
  rotation: [number, number, number];
  color: number;
  viewerPosition: [number, number, number];
};

const base: PipelineSceneState = {
  object: true, solid: true, wire: false, axes: false, light: false, camera: false,
  screen: false, raster: false, grid: false,
  position: [0, 0, 0], scale: 1, rotation: [0, 0, 0], color: 0xbf2732, viewerPosition: [0, 1.3, 6.6]
};

/** One persistent scene, described by stage keyframes in pipeline order. */
/** The model matrix applied after the cube's initial Model-Space state. */
export const cubeModelTransform = {
  position: [.7, .25, -1] as [number, number, number],
  rotation: [.45, .55, 0] as [number, number, number]
};

export const pipelineKeyframes: readonly PipelineSceneState[] = [
  { ...base, solid: false, wire: true, axes: true, grid: true },
  { ...base, wire: true, axes: true, grid: true, ...cubeModelTransform },
  { ...base, light: true, grid: true, color: 0xe8a0a5, ...cubeModelTransform },
  { ...base, grid: false, viewerPosition: [5.8, 3.2, 6.2] },
  { ...base, camera: true, grid: true, ...cubeModelTransform, viewerPosition: [5.8, 3.2, 6.2] },
  { ...base, grid: true },
  { ...base, object: false, screen: true, viewerPosition: [0, 0, 5.2] },
  { ...base, object: false, screen: true, raster: true, viewerPosition: [0, 0, 5.2] },
  { ...base, object: false, screen: true, light: true, viewerPosition: [0, 0, 5.2] },
  { ...base, object: false, screen: true, light: true, viewerPosition: [0, 0, 5.2] }
];

const cubeVertices = [
  [-.725, -.725, -.725], [.725, -.725, -.725], [.725, .725, -.725], [-.725, .725, -.725],
  [-.725, -.725, .725], [.725, -.725, .725], [.725, .725, .725], [-.725, .725, .725]
] as const;
const cubeTriangles = [
  0, 2, 1, 0, 3, 2, 1, 2, 6, 1, 6, 5, 5, 6, 7, 5, 7, 4,
  4, 7, 3, 4, 3, 0, 3, 7, 6, 3, 6, 2, 4, 0, 1, 4, 1, 5
];

function clipPolygon(polygon: THREE.Vector3[], signedDistance: (point: THREE.Vector3) => number) {
  const output: THREE.Vector3[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index]!;
    const b = polygon[(index + 1) % polygon.length]!;
    const da = signedDistance(a);
    const db = signedDistance(b);
    const aInside = da >= 0;
    const bInside = db >= 0;
    if (aInside) output.push(a);
    if (aInside !== bInside) output.push(a.clone().lerp(b, da / (da - db)));
  }
  return output;
}

/** Actual model/view/projection data and the cube clipped against all NDC planes. */
export function createPipelineGeometry() {
  const model = new THREE.Matrix4().compose(
    new THREE.Vector3(...cubeModelTransform.position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...cubeModelTransform.rotation)),
    new THREE.Vector3(1, 1, 1)
  );
  const pipelineCamera = new THREE.PerspectiveCamera(45, 1.6, 1, 4.5);
  pipelineCamera.position.set(0, .9, 3);
  pipelineCamera.lookAt(0, 0, -.8);
  pipelineCamera.updateMatrixWorld(true);
  pipelineCamera.updateProjectionMatrix();
  const mvp = new THREE.Matrix4().multiplyMatrices(pipelineCamera.projectionMatrix, pipelineCamera.matrixWorldInverse).multiply(model);
  const modelView = new THREE.Matrix4().multiplyMatrices(pipelineCamera.matrixWorldInverse, model);
  const viewGeometry = new THREE.BoxGeometry(1.45, 1.45, 1.45).applyMatrix4(modelView);
  const ndc = cubeVertices.map(([x, y, z]) => {
    const clip = new THREE.Vector4(x, y, z, 1).applyMatrix4(mvp);
    return new THREE.Vector3(clip.x / clip.w, clip.y / clip.w, clip.z / clip.w);
  });
  const planes = [(p: THREE.Vector3) => p.x + 1, (p: THREE.Vector3) => 1 - p.x, (p: THREE.Vector3) => p.y + 1, (p: THREE.Vector3) => 1 - p.y, (p: THREE.Vector3) => p.z + 1, (p: THREE.Vector3) => 1 - p.z];
  const clipped: number[] = [];
  for (let index = 0; index < cubeTriangles.length; index += 3) {
    let polygon = [ndc[cubeTriangles[index]!]!, ndc[cubeTriangles[index + 1]!]!, ndc[cubeTriangles[index + 2]!]!].map(point => point.clone());
    for (const plane of planes) polygon = clipPolygon(polygon, plane);
    for (let corner = 1; corner < polygon.length - 1; corner += 1) clipped.push(...polygon[0]!.toArray(), ...polygon[corner]!.toArray(), ...polygon[corner + 1]!.toArray());
  }
  const ndcGeometry = new THREE.BufferGeometry();
  ndcGeometry.setAttribute('position', new THREE.Float32BufferAttribute(clipped, 3));
  const screenGeometry = ndcGeometry.clone();
  const screenPositions = screenGeometry.getAttribute('position') as THREE.BufferAttribute;
  for (let index = 0; index < screenPositions.count; index += 1) screenPositions.setXYZ(index, screenPositions.getX(index) * 1.8, screenPositions.getY(index) * 1.25, 0);
  for (let index = 0; index < screenPositions.count; index += 1) {
    // Keep a scaled, inverted NDC depth for the display camera. Near fragments
    // remain in front of far fragments after the viewport transform.
    screenPositions.setZ(index, -ndcGeometry.getAttribute('position').getZ(index) * .04);
  }
  screenPositions.needsUpdate = true;
  const rasterPositions: number[] = [];
  const pointInTriangle = (x: number, y: number, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
    const u = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / denominator;
    const v = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / denominator;
    return u >= 0 && v >= 0 && u + v <= 1;
  };
  for (let index = 0; index < screenPositions.count; index += 3) {
    const a = new THREE.Vector3(screenPositions.getX(index), screenPositions.getY(index), 0);
    const b = new THREE.Vector3(screenPositions.getX(index + 1), screenPositions.getY(index + 1), 0);
    const c = new THREE.Vector3(screenPositions.getX(index + 2), screenPositions.getY(index + 2), 0);
    const signedArea = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (signedArea <= 0) continue; // Back-face culling in screen space.
    const minX = Math.floor(Math.min(a.x, b.x, c.x) / .075) * .075;
    const maxX = Math.ceil(Math.max(a.x, b.x, c.x) / .075) * .075;
    const minY = Math.floor(Math.min(a.y, b.y, c.y) / .075) * .075;
    const maxY = Math.ceil(Math.max(a.y, b.y, c.y) / .075) * .075;
    for (let x = minX; x <= maxX; x += .075) for (let y = minY; y <= maxY; y += .075) if (pointInTriangle(x, y, a, b, c)) rasterPositions.push(x, y, screenPositions.getZ(index));
  }
  const rasterGeometry = new THREE.BufferGeometry();
  rasterGeometry.setAttribute('position', new THREE.Float32BufferAttribute(rasterPositions, 3));
  return { pipelineCamera, viewGeometry, ndcGeometry, screenGeometry, rasterGeometry };
}
