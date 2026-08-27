import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import definitions from '$lib/data/teaching.json';
import type { Scene, ViewportOverlays } from '$lib/renderer/Renderer';
import type { ShaderTemplate } from '$lib/stores/taskStore';
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
  code: string;
}

const STORAGE_PREFIX = 'shaderlab:teaching:v2:';
const initialState: TeachingState = { definition: null, values: {}, code: '' };

function loadSaved(definition: TeachingDefinition) {
  const source = definition.vertexShader ? 'vertex' : 'fragment';
  // Keep the editor contents aligned with the tab chosen by the teaching page:
  // it shows vertex.glsl whenever a vertex exercise exists, otherwise fragment.glsl.
  const defaultCode = definition.vertexShader ?? definition.fragmentShader ?? '';
  if (!browser) return { values: {}, code: defaultCode };
  try {
    const saved = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}${definition.id}`) ?? 'null');
    if (saved && typeof saved === 'object' && ('values' in saved || 'code' in saved)) {
      return {
        values: saved.values && typeof saved.values === 'object' ? saved.values : {},
        code: typeof saved.code === 'string' && saved.source === source ? saved.code : defaultCode
      };
    }
    return { values: {}, code: defaultCode };
  } catch {
    return { values: {}, code: defaultCode };
  }
}

function persist(definition: TeachingDefinition, values: Record<string, TeachingValue>, code: string) {
  if (!browser) return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${definition.id}`, JSON.stringify({
      values,
      code,
      source: definition.vertexShader ? 'vertex' : 'fragment'
    }));
  } catch { /* storage is optional */ }
}

function createTeachingStore() {
  const store = writable<TeachingState>(initialState);
  return {
    subscribe: store.subscribe,
    load(id: string) {
      const definition = (definitions as TeachingDefinition[]).find(item => item.id === id) ?? null;
      const saved = definition ? loadSaved(definition) : { values: {}, code: '' };
      store.set({ definition, values: saved.values, code: saved.code });
    },
    setValue(id: string, value: TeachingValue) {
      store.update(state => {
        if (!state.definition) return state;
        const values = { ...state.values, [id]: value };
        persist(state.definition, values, state.code);
        return { ...state, values };
      });
    },
    setValues(nextValues: Record<string, TeachingValue>) {
      store.update(state => {
        if (!state.definition) return state;
        const values = { ...state.values, ...nextValues };
        persist(state.definition, values, state.code);
        return { ...state, values };
      });
    },
    applyPreset(values: Record<string, TeachingValue>) {
      store.update(state => {
        if (!state.definition) return state;
        const nextValues = { ...values };
        persist(state.definition, nextValues, state.code);
        return { ...state, values: nextValues };
      });
    },
    /** Drops every override so each control falls back to the default in its @control annotation. */
    resetValues() {
      store.update(state => {
        if (!state.definition) return state;
        persist(state.definition, {}, state.code);
        return { ...state, values: {} };
      });
    },
    setCode(code: string) {
      store.update(state => {
        if (!state.definition) return state;
        persist(state.definition, state.values, code);
        return { ...state, code };
      });
    }
  };
}

export const teachingStore = createTeachingStore();
