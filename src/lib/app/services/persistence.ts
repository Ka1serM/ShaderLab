import { browser } from '$app/environment';
import type { CameraPose, ShaderStage, TeachingValue } from '../types';

/**
 * The only code that touches localStorage. Keys and formats are those of
 * earlier versions, so saved student work keeps loading. Writes are collected
 * per key and flushed after a short delay, and when the page is hidden.
 */

export type StageCode = Partial<Record<ShaderStage, string>>;

export interface TaskWorkspace {
  taskSlug: string;
  userCode: StageCode;
  activeTab: ShaderStage;
  /** Only present once the user moved the camera. */
  cameraPose?: CameraPose;
}

export interface TeachingWorkspace {
  userCode: StageCode;
  parameters: Record<string, TeachingValue>;
  cameraPose?: CameraPose;
}

export type SplitterSizes = { outer: number; inner: number; viewports: number };

const TASK_WORKSPACES_KEY = 'shaderlab:user-workspaces:v1';
const TEACHING_WORKSPACE_PREFIX = 'shaderlab:teaching-user-workspaces:v1:';
const SPLITTER_PREFIX = 'shaderlab:splitters:';
const FONT_SIZE_KEY = 'shaderlab:editor-font-size';
const SAVE_DELAY = 300;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every(key => allowed.includes(key));
}

function isFiniteList(value: unknown, length: number) {
  return Array.isArray(value) && value.length === length && value.every(Number.isFinite);
}

export function isCameraPose(value: unknown): value is CameraPose {
  return isRecord(value)
    && isFiniteList(value.position, 3)
    && isFiniteList(value.quaternion, 4)
    && isFiniteList(value.target, 3)
    && typeof value.fov === 'number' && Number.isFinite(value.fov);
}

function isStageCode(value: unknown): value is StageCode {
  return isRecord(value) && hasOnlyKeys(value, ['vertex', 'fragment'])
    && (value.vertex === undefined || typeof value.vertex === 'string')
    && (value.fragment === undefined || typeof value.fragment === 'string');
}

function isTeachingValue(value: unknown): value is TeachingValue {
  return typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
    || (Array.isArray(value) && value.every(item => typeof item === 'number' && Number.isFinite(item)));
}

function isTaskWorkspace(value: unknown): value is TaskWorkspace {
  return isRecord(value) && hasOnlyKeys(value, ['taskSlug', 'userCode', 'activeTab', 'cameraPose'])
    && typeof value.taskSlug === 'string'
    && isStageCode(value.userCode)
    && (value.activeTab === 'vertex' || value.activeTab === 'fragment')
    && (value.cameraPose === undefined || isCameraPose(value.cameraPose));
}

function isTeachingWorkspace(value: unknown): value is TeachingWorkspace {
  return isRecord(value) && hasOnlyKeys(value, ['userCode', 'parameters', 'cameraPose'])
    && isStageCode(value.userCode)
    && isRecord(value.parameters) && Object.values(value.parameters).every(isTeachingValue)
    && (value.cameraPose === undefined || isCameraPose(value.cameraPose));
}

function isSplitterSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

export class Persistence {
  private readonly pending = new Map<string, string>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private taskWorkspaces: Record<string, TaskWorkspace> | undefined;

  constructor() {
    if (browser) window.addEventListener('pagehide', () => this.flush());
  }

  /** Writes every pending value now. */
  flush() {
    clearTimeout(this.timer);
    this.timer = undefined;
    for (const [key, value] of this.pending) {
      try {
        localStorage.setItem(key, value);
      } catch (error) {
        // Storage can be disabled or full; the state still applies for this session.
        console.error(`Failed to save ${key}:`, error);
      }
    }
    this.pending.clear();
  }

  taskWorkspace(slug: string): TaskWorkspace | undefined {
    const workspace = this.loadTaskWorkspaces()[slug];
    return workspace?.taskSlug === slug ? workspace : undefined;
  }

  saveTaskWorkspace(workspace: TaskWorkspace) {
    const workspaces = this.loadTaskWorkspaces();
    workspaces[workspace.taskSlug] = workspace;
    this.write(TASK_WORKSPACES_KEY, JSON.stringify(workspaces));
  }

  /** A teaching workspace belongs to one version of the demo's content. */
  teachingWorkspace(id: string, contentVersion: string): TeachingWorkspace | undefined {
    const value = this.read(`${TEACHING_WORKSPACE_PREFIX}${id}:${contentVersion}`);
    return isTeachingWorkspace(value) ? value : undefined;
  }

  saveTeachingWorkspace(id: string, contentVersion: string, workspace: TeachingWorkspace) {
    this.write(`${TEACHING_WORKSPACE_PREFIX}${id}:${contentVersion}`, JSON.stringify(workspace));
  }

  splitterSizes(page: string, fallback: SplitterSizes): SplitterSizes {
    const stored = this.read(`${SPLITTER_PREFIX}${page}`);
    if (!isRecord(stored)) return { ...fallback };
    return {
      outer: isSplitterSize(stored.outer) ? stored.outer : fallback.outer,
      inner: isSplitterSize(stored.inner) ? stored.inner : fallback.inner,
      viewports: isSplitterSize(stored.viewports) ? stored.viewports : fallback.viewports
    };
  }

  saveSplitterSizes(page: string, sizes: SplitterSizes) {
    this.write(`${SPLITTER_PREFIX}${page}`, JSON.stringify(sizes));
  }

  editorFontSize(): number | undefined {
    if (!browser) return undefined;
    try {
      const stored = Number(localStorage.getItem(FONT_SIZE_KEY));
      return stored > 0 ? stored : undefined;
    } catch {
      return undefined;
    }
  }

  saveEditorFontSize(size: number) {
    this.write(FONT_SIZE_KEY, String(size));
  }

  private loadTaskWorkspaces() {
    if (this.taskWorkspaces) return this.taskWorkspaces;
    const stored = this.read(TASK_WORKSPACES_KEY);
    this.taskWorkspaces = isRecord(stored)
      ? Object.fromEntries(Object.entries(stored).filter((entry): entry is [string, TaskWorkspace] => isTaskWorkspace(entry[1])))
      : {};
    return this.taskWorkspaces;
  }

  private read(key: string): unknown {
    if (!browser) return undefined;
    try {
      const raw = this.pending.get(key) ?? localStorage.getItem(key);
      return raw === null ? undefined : JSON.parse(raw);
    } catch (error) {
      console.error(`Failed to load ${key}:`, error);
      return undefined;
    }
  }

  private write(key: string, value: string) {
    if (!browser) return;
    this.pending.set(key, value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), SAVE_DELAY);
  }
}
