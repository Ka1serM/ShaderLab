import type { ViewportCameraPose } from './Renderer';

export interface LinkedCamera {
  /** Width / height of the viewport. */
  readonly aspect: number;
  followCamera(pose: ViewportCameraPose, userMoved: boolean): void;
}

/**
 * Makes several viewports show one camera. A member shares its pose in the
 * same frame that its orbit controls, view helper or auto-fit move it, and the
 * other members apply that pose without sharing it again. Applying a pose
 * stops the member's own orbit inertia, so the latest input always owns the
 * camera.
 */
export class CameraLink {
  private readonly members = new Set<LinkedCamera>();

  join(member: LinkedCamera) {
    this.members.add(member);
  }

  leave(member: LinkedCamera) {
    this.members.delete(member);
  }

  share(source: LinkedCamera, pose: ViewportCameraPose, userMoved: boolean) {
    for (const member of this.members) if (member !== source) member.followCamera(pose, userMoved);
  }

  /** An auto-fit uses the widest viewport: with a fixed horizontal FOV it has the smallest vertical FOV. */
  widestAspect() {
    let widest = 0;
    for (const member of this.members) widest = Math.max(widest, member.aspect);
    return widest;
  }
}
