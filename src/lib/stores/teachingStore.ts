import { get, writable } from 'svelte/store';
import { browser } from '$app/environment';
import type { Scene, ViewportOverlays } from '$lib/renderer/Renderer';
import type { ShaderInput } from '$lib/renderer/ShaderTaskMaterial';
import type { CameraPose, ShaderStage, ShaderTemplate } from '$lib/stores/taskStore';
import type { TeachingValue } from '$lib/utils/shaderControls';

export type { TeachingControl, TeachingValue } from '$lib/utils/shaderControls';

export interface TeachingPreset {
  name: string;
  values: Record<string, TeachingValue>;
}

export interface Teach {
  id: string;
  contentVersion: string;
  title: string;
  category?: string;
  presets?: TeachingPreset[];
  overview: string;
  explanation: string;
  shaderStages: ShaderStage[];
  vertexShader?: string;
  fragmentShader?: string;
  vertexShaderTemplate?: ShaderTemplate;
  fragmentShaderTemplate?: ShaderTemplate;
  inputs?: ShaderInput[];
  scenes: Scene[];
  overlays?: ViewportOverlays;
  showTimeControl?: boolean;
}

export interface TeachingState {
  definition: Teach | null;
  /** Overrides only: a control without an entry here shows the default from its @control annotation. */
  values: Record<string, TeachingValue>;
  userCode: Partial<Record<'vertex' | 'fragment', string>>;
  cameraPose: CameraPose;
  cameraPoseSaved: boolean;
}

interface TeachingUserWorkspace {
  userCode: Partial<Record<'vertex' | 'fragment', string>>;
  parameters: Record<string, TeachingValue>;
  cameraPose?: CameraPose;
}

const STORAGE_PREFIX = 'shaderlab:teaching-user-workspaces:v1:';
const defaultCameraPose = (): CameraPose => ({ position: [0, 0, 1], quaternion: [0, 0, 0, 1], target: [0, 0, 0], fov: 30 });
const initialState: TeachingState = {
  definition: null,
  values: {},
  userCode: {},
  cameraPose: defaultCameraPose(),
  cameraPoseSaved: false
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every(key => allowed.includes(key));
}

function isUserCode(value: unknown): value is TeachingUserWorkspace['userCode'] {
  if (!isRecord(value) || !hasOnlyKeys(value, ['vertex', 'fragment'])) return false;
  return (value.vertex === undefined || typeof value.vertex === 'string')
    && (value.fragment === undefined || typeof value.fragment === 'string');
}

function isTeachingValue(value: unknown): value is TeachingValue {
  return typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
    || (Array.isArray(value) && value.every(item => typeof item === 'number' && Number.isFinite(item)));
}

function isCameraPose(value: unknown): value is CameraPose {
  if (!isRecord(value)) return false;
  const pose = value as Partial<CameraPose>;
  return Array.isArray(pose.position) && pose.position.length === 3 && pose.position.every(Number.isFinite)
    && Array.isArray(pose.quaternion) && pose.quaternion.length === 4 && pose.quaternion.every(Number.isFinite)
    && Array.isArray(pose.target) && pose.target.length === 3 && pose.target.every(Number.isFinite)
    && typeof pose.fov === 'number' && Number.isFinite(pose.fov);
}

function isParameterOverrides(value: unknown): value is Record<string, TeachingValue> {
  return isRecord(value) && Object.values(value).every(isTeachingValue);
}

function isTeachingUserWorkspace(value: unknown): value is TeachingUserWorkspace {
  if (!isRecord(value) || !hasOnlyKeys(value, ['userCode', 'parameters', 'cameraPose'])) return false;
  return isUserCode(value.userCode)
    && isParameterOverrides(value.parameters)
    && (value.cameraPose === undefined || isCameraPose(value.cameraPose));
}

const storageKey = (definition: Teach) => `${STORAGE_PREFIX}${definition.id}:${definition.contentVersion}`;

// Writes are collected per lesson and flushed after a short delay, so a slider drag does not write on every input event.
const pendingWorkspaces = new Map<string, TeachingUserWorkspace>();
let saveTimeout: ReturnType<typeof setTimeout> | undefined;

function flushWorkspaces() {
  clearTimeout(saveTimeout);
  saveTimeout = undefined;
  for (const [key, workspace] of pendingWorkspaces) {
    try {
      localStorage.setItem(key, JSON.stringify(workspace));
    } catch { /* storage is optional */ }
  }
  pendingWorkspaces.clear();
}

if (browser) window.addEventListener('pagehide', flushWorkspaces);

function loadSaved(definition: Teach) {
  if (!browser) return { values: {}, userCode: {}, cameraPose: undefined };
  const key = storageKey(definition);
  try {
    const saved = pendingWorkspaces.get(key) ?? JSON.parse(localStorage.getItem(key) ?? 'null');
    return isTeachingUserWorkspace(saved)
      ? { values: { ...saved.parameters }, userCode: { ...saved.userCode }, cameraPose: saved.cameraPose }
      : { values: {}, userCode: {}, cameraPose: undefined };
  } catch {
    return { values: {}, userCode: {}, cameraPose: undefined };
  }
}

/** A camera the user never moved is not saved: it would pin the view and disable the automatic framing. */
function persisted(state: TeachingState) {
  if (!browser || !state.definition) return state;
  pendingWorkspaces.set(storageKey(state.definition), {
    userCode: state.userCode,
    parameters: state.values,
    cameraPose: state.cameraPoseSaved ? state.cameraPose : undefined
  });
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(flushWorkspaces, 300);
  return state;
}

function createTeachingStore() {
  const store = writable<TeachingState>(initialState);
  return {
    subscribe: store.subscribe,
    /** Shows `definition` with the user's saved parameters, code and camera for it. */
    setDefinition(definition: Teach) {
      if (get(store).definition?.id === definition.id) return;
      const saved = loadSaved(definition);
      store.set({
        definition,
        values: saved.values,
        userCode: saved.userCode,
        cameraPose: saved.cameraPose ?? defaultCameraPose(),
        cameraPoseSaved: Boolean(saved.cameraPose)
      });
    },
    setValue(id: string, value: TeachingValue) {
      store.update(state => {
        if (!state.definition) return state;
        return persisted({ ...state, values: { ...state.values, [id]: value } });
      });
    },
    resetValue(id: string) {
      store.update(state => {
        if (!state.definition || !(id in state.values)) return state;
        const values = { ...state.values };
        delete values[id];
        return persisted({ ...state, values });
      });
    },
    setValues(nextValues: Record<string, TeachingValue>) {
      store.update(state => {
        if (!state.definition) return state;
        return persisted({ ...state, values: { ...state.values, ...nextValues } });
      });
    },
    applyPreset(values: Record<string, TeachingValue>) {
      store.update(state => {
        if (!state.definition) return state;
        return persisted({ ...state, values: { ...values } });
      });
    },
    /** Drops every override so each control falls back to the default in its @control annotation. */
    resetValues() {
      store.update(state => {
        if (!state.definition) return state;
        return persisted({ ...state, values: {} });
      });
    },
    setCode(source: 'vertex' | 'fragment', code: string) {
      store.update(state => {
        if (!state.definition) return state;
        const defaultCode = source === 'vertex' ? state.definition.vertexShader : state.definition.fragmentShader;
        const userCode = { ...state.userCode };
        if (code === (defaultCode ?? '')) delete userCode[source];
        else userCode[source] = code;
        return persisted({ ...state, userCode });
      });
    },
    setCameraPose(cameraPose: CameraPose) {
      store.update(state => {
        if (!state.definition || (state.cameraPoseSaved && JSON.stringify(state.cameraPose) === JSON.stringify(cameraPose))) return state;
        return persisted({ ...state, cameraPose, cameraPoseSaved: true });
      });
    }
  };
}

export const teachingStore = createTeachingStore();
