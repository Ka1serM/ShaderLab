import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { loadTeachingContent } from '$lib/content';
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

function loadSaved(definition: Teach) {
  if (!browser) return { values: {}, userCode: {}, cameraPose: undefined };
  try {
    const saved = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}${definition.id}:${definition.contentVersion}`) ?? 'null');
    return isTeachingUserWorkspace(saved)
      ? { values: { ...saved.parameters }, userCode: { ...saved.userCode }, cameraPose: saved.cameraPose }
      : { values: {}, userCode: {}, cameraPose: undefined };
  } catch {
    return { values: {}, userCode: {}, cameraPose: undefined };
  }
}

function persist(definition: Teach, values: Record<string, TeachingValue>, userCode: TeachingState['userCode'], cameraPose: CameraPose) {
  if (!browser) return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${definition.id}:${definition.contentVersion}`, JSON.stringify({
      userCode,
      parameters: values,
      cameraPose
    } satisfies TeachingUserWorkspace));
  } catch { /* storage is optional */ }
}

function createTeachingStore() {
  const store = writable<TeachingState>(initialState);
  return {
    subscribe: store.subscribe,
    async load(id: string) {
      const definition = await loadTeachingContent(id);
      const saved = definition ? loadSaved(definition) : { values: {}, userCode: {}, cameraPose: undefined };
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
        const values = { ...state.values, [id]: value };
        persist(state.definition, values, state.userCode, state.cameraPose);
        return { ...state, values };
      });
    },
    setValues(nextValues: Record<string, TeachingValue>) {
      store.update(state => {
        if (!state.definition) return state;
        const values = { ...state.values, ...nextValues };
        persist(state.definition, values, state.userCode, state.cameraPose);
        return { ...state, values };
      });
    },
    applyPreset(values: Record<string, TeachingValue>) {
      store.update(state => {
        if (!state.definition) return state;
        const nextValues = { ...values };
        persist(state.definition, nextValues, state.userCode, state.cameraPose);
        return { ...state, values: nextValues };
      });
    },
    /** Drops every override so each control falls back to the default in its @control annotation. */
    resetValues() {
      store.update(state => {
        if (!state.definition) return state;
        persist(state.definition, {}, state.userCode, state.cameraPose);
        return { ...state, values: {} };
      });
    },
    setCode(source: 'vertex' | 'fragment', code: string) {
      store.update(state => {
        if (!state.definition) return state;
        const defaultCode = source === 'vertex' ? state.definition.vertexShader : state.definition.fragmentShader;
        const userCode = { ...state.userCode };
        if (code === (defaultCode ?? '')) delete userCode[source];
        else userCode[source] = code;
        persist(state.definition, state.values, userCode, state.cameraPose);
        return { ...state, userCode };
      });
    },
    setCameraPose(cameraPose: CameraPose) {
      store.update(state => {
        if (!state.definition || (state.cameraPoseSaved && JSON.stringify(state.cameraPose) === JSON.stringify(cameraPose))) return state;
        persist(state.definition, state.values, state.userCode, cameraPose);
        return { ...state, cameraPose, cameraPoseSaved: true };
      });
    }
  };
}

export const teachingStore = createTeachingStore();
