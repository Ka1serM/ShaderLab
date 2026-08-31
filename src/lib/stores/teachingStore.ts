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
  codes: Partial<Record<'vertex' | 'fragment', string>>;
}

const STORAGE_PREFIX = 'shaderlab:teaching:v2:';
const initialState: TeachingState = { definition: null, values: {}, codes: {} };

function loadSaved(definition: TeachingDefinition) {
  const source = definition.vertexShader ? 'vertex' : 'fragment';
  // Keep the editor contents aligned with the tab chosen by the teaching page:
  // it shows vertex.glsl whenever a vertex exercise exists, otherwise fragment.glsl.
  const defaultCodes = { vertex: definition.vertexShader, fragment: definition.fragmentShader };
  const revision = contentRevision(definition);
  if (!browser) return { values: {}, codes: defaultCodes };
  try {
    const saved = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}${definition.id}`) ?? 'null');
    if (saved && typeof saved === 'object' && saved.revision === revision && ('values' in saved || 'code' in saved)) {
      return {
        values: saved.values && typeof saved.values === 'object' ? saved.values : {},
        // Accept the former one-editor storage format when loading an existing lesson.
        codes: saved.codes && typeof saved.codes === 'object'
          ? { ...defaultCodes, ...saved.codes }
          : { ...defaultCodes, [source]: typeof saved.code === 'string' ? saved.code : defaultCodes[source] }
      };
    }
    return { values: {}, codes: defaultCodes };
  } catch {
    return { values: {}, codes: defaultCodes };
  }
}

function contentRevision(definition: TeachingDefinition) {
  const source = [definition.vertexShader, definition.fragmentShader,
    definition.vertexShaderTemplate?.prefix, definition.vertexShaderTemplate?.suffix,
    definition.fragmentShaderTemplate?.prefix, definition.fragmentShaderTemplate?.suffix].join('\u0000');
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function persist(definition: TeachingDefinition, values: Record<string, TeachingValue>, codes: TeachingState['codes']) {
  if (!browser) return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${definition.id}`, JSON.stringify({
      values,
      codes,
      revision: contentRevision(definition)
    }));
  } catch { /* storage is optional */ }
}

function createTeachingStore() {
  const store = writable<TeachingState>(initialState);
  return {
    subscribe: store.subscribe,
    load(id: string) {
      const definition = (definitions as TeachingDefinition[]).find(item => item.id === id) ?? null;
      const saved = definition ? loadSaved(definition) : { values: {}, codes: {} };
      store.set({ definition, values: saved.values, codes: saved.codes });
    },
    setValue(id: string, value: TeachingValue) {
      store.update(state => {
        if (!state.definition) return state;
        const values = { ...state.values, [id]: value };
        persist(state.definition, values, state.codes);
        return { ...state, values };
      });
    },
    setValues(nextValues: Record<string, TeachingValue>) {
      store.update(state => {
        if (!state.definition) return state;
        const values = { ...state.values, ...nextValues };
        persist(state.definition, values, state.codes);
        return { ...state, values };
      });
    },
    applyPreset(values: Record<string, TeachingValue>) {
      store.update(state => {
        if (!state.definition) return state;
        const nextValues = { ...values };
        persist(state.definition, nextValues, state.codes);
        return { ...state, values: nextValues };
      });
    },
    /** Drops every override so each control falls back to the default in its @control annotation. */
    resetValues() {
      store.update(state => {
        if (!state.definition) return state;
        persist(state.definition, {}, state.codes);
        return { ...state, values: {} };
      });
    },
    setCode(source: 'vertex' | 'fragment', code: string) {
      store.update(state => {
        if (!state.definition) return state;
        const codes = { ...state.codes, [source]: code };
        persist(state.definition, state.values, codes);
        return { ...state, codes };
      });
    }
  };
}

export const teachingStore = createTeachingStore();
