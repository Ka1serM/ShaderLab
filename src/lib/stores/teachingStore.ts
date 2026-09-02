import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import definitions from '$lib/data/teaching.json';
import type { Scene, ViewportOverlays } from '$lib/renderer/Renderer';
import type { ShaderStage, ShaderTemplate } from '$lib/stores/taskStore';
import type { TeachingValue } from '$lib/utils/shaderControls';

export type TeachingType = 'shader-controls';
export type { TeachingControl, TeachingValue } from '$lib/utils/shaderControls';

export interface TeachingPreset {
  name: string;
  values: Record<string, TeachingValue>;
}

export interface TeachingDefinition {
  id: string;
  title: string;
  category?: string;
  task?: string;
  type: TeachingType;
  presets?: TeachingPreset[];
  overview: string;
  explanation: string;
  shaderStages?: ShaderStage[];
  vertexShader?: string;
  fragmentShader?: string;
  vertexShaderTemplate?: ShaderTemplate;
  fragmentShaderTemplate?: ShaderTemplate;
  scene?: Scene;
  overlays?: ViewportOverlays;
}

export interface TeachingState {
  definition: TeachingDefinition | null;
  /** Overrides only: a control without an entry here shows the default from its @control annotation. */
  values: Record<string, TeachingValue>;
  userCode: Partial<Record<'vertex' | 'fragment', string>>;
}

interface TeachingUserWorkspace {
  userCode: Partial<Record<'vertex' | 'fragment', string>>;
  parameters: Record<string, TeachingValue>;
}

const STORAGE_PREFIX = 'shaderlab:teaching-user-workspaces:v1:';
const initialState: TeachingState = { definition: null, values: {}, userCode: {} };

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

function isParameterOverrides(value: unknown): value is Record<string, TeachingValue> {
  return isRecord(value) && Object.values(value).every(isTeachingValue);
}

function isTeachingUserWorkspace(value: unknown): value is TeachingUserWorkspace {
  if (!isRecord(value) || !hasOnlyKeys(value, ['userCode', 'parameters'])) return false;
  return isUserCode(value.userCode)
    && isParameterOverrides(value.parameters);
}

function loadSaved(definition: TeachingDefinition) {
  if (!browser) return { values: {}, userCode: {} };
  try {
    const saved = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}${definition.id}`) ?? 'null');
    return isTeachingUserWorkspace(saved)
      ? { values: { ...saved.parameters }, userCode: { ...saved.userCode } }
      : { values: {}, userCode: {} };
  } catch {
    return { values: {}, userCode: {} };
  }
}

function persist(definition: TeachingDefinition, values: Record<string, TeachingValue>, userCode: TeachingState['userCode']) {
  if (!browser) return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${definition.id}`, JSON.stringify({
      userCode,
      parameters: values
    } satisfies TeachingUserWorkspace));
  } catch { /* storage is optional */ }
}

function createTeachingStore() {
  const store = writable<TeachingState>(initialState);
  return {
    subscribe: store.subscribe,
    load(id: string) {
      const definition = (definitions as TeachingDefinition[]).find(item => item.id === id) ?? null;
      const saved = definition ? loadSaved(definition) : { values: {}, userCode: {} };
      store.set({ definition, values: saved.values, userCode: saved.userCode });
    },
    setValue(id: string, value: TeachingValue) {
      store.update(state => {
        if (!state.definition) return state;
        const values = { ...state.values, [id]: value };
        persist(state.definition, values, state.userCode);
        return { ...state, values };
      });
    },
    setValues(nextValues: Record<string, TeachingValue>) {
      store.update(state => {
        if (!state.definition) return state;
        const values = { ...state.values, ...nextValues };
        persist(state.definition, values, state.userCode);
        return { ...state, values };
      });
    },
    applyPreset(values: Record<string, TeachingValue>) {
      store.update(state => {
        if (!state.definition) return state;
        const nextValues = { ...values };
        persist(state.definition, nextValues, state.userCode);
        return { ...state, values: nextValues };
      });
    },
    /** Drops every override so each control falls back to the default in its @control annotation. */
    resetValues() {
      store.update(state => {
        if (!state.definition) return state;
        persist(state.definition, {}, state.userCode);
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
        persist(state.definition, state.values, userCode);
        return { ...state, userCode };
      });
    }
  };
}

export const teachingStore = createTeachingStore();
