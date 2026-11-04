import type { ViewportCameraPose } from './Renderer';

export interface LinkedCamera {
  readonly aspect: number;
  followCamera(pose: ViewportCameraPose, userMoved: boolean): void;
}

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

  widestAspect() {
    let widest = 0;
    for (const member of this.members) widest = Math.max(widest, member.aspect);
    return widest;
  }
}
