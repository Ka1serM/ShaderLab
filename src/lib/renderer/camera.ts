export type ViewportCameraPose = {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  target: [number, number, number];
  fov: number;
};

export const defaultCameraPose = (): ViewportCameraPose => ({ position: [0, 0, 1], quaternion: [0, 0, 0, 1], target: [0, 0, 0], fov: 30 });
