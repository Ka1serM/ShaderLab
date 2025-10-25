import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import tasks from '$lib/data/tasks.json';
import { slugify } from '$lib/utils/slugify';

export interface Task {
  title: string;
  task: string;
  theory: string;
  hints: string[];
  starterVertexShader: string;
  starterFragmentShader: string;
  referenceVertexShader: string;
  referenceFragmentShader: string;
  modelPath: string;
  type: "2D" | "3D";
  instanceCount?: number;
}

export interface GLSLError {
  type: 'error' | 'warning';
  line: number;
  message: string;
  timestamp: number;
}

interface TaskState {
  task: Task | null;
  vertexShader: string;
  fragmentShader: string;
  activeTab: 'vertex' | 'fragment';
  shaderErrors: {
    vertex: GLSLError[];
    fragment: GLSLError[];
  };
  _version: number; // force unique state for reactivity
}

// ------------------- Persistence -------------------
function createPersistence() {
  let autoSaveTimeout: ReturnType<typeof setTimeout> | null = null;

  const storageKey = (taskTitle: string, field: string) =>
    `shader-${taskTitle.replace(/\s+/g, '_')}-${field}`;

  return {
    save(taskTitle: string, vertex: string, fragment: string, tab: 'vertex' | 'fragment') {
      if (!browser) return;
      if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
      autoSaveTimeout = setTimeout(() => {
        try {
          localStorage.setItem(storageKey(taskTitle, 'vertex'), vertex);
          localStorage.setItem(storageKey(taskTitle, 'fragment'), fragment);
          localStorage.setItem(storageKey(taskTitle, 'tab'), tab);
        } catch (e) {
          console.error('Failed to save:', e);
        }
      }, 300);
    },

    load(taskTitle: string) {
      if (!browser) return null;
      try {
        return {
          vertex: localStorage.getItem(storageKey(taskTitle, 'vertex')),
          fragment: localStorage.getItem(storageKey(taskTitle, 'fragment')),
          tab: localStorage.getItem(storageKey(taskTitle, 'tab')) as 'vertex' | 'fragment' | null
        };
      } catch (e) {
        console.error('Failed to load saved state:', e);
        return null;
      }
    }
  };
}

// ------------------- Store -------------------
function createTaskStore() {
  const store = writable<TaskState>({
    task: null,
    vertexShader: '',
    fragmentShader: '',
    activeTab: 'fragment',
    shaderErrors: { vertex: [], fragment: [] },
    _version: 0
  });

  const persistence = createPersistence();
  let currentTaskTitle: string | null = null;

  return {
    subscribe: store.subscribe,

    loadTask(slug: string) {
      if (!browser) return;

      const normalizedSlug = slugify(slug);
      const task = (tasks as Task[]).find(t => slugify(t.title) === normalizedSlug);

      if (!task) {
        console.error('Task not found for slug:', slug);
        currentTaskTitle = null;
        store.set({
          task: null,
          vertexShader: '',
          fragmentShader: '',
          activeTab: 'fragment',
          shaderErrors: { vertex: [], fragment: [] },
          _version: 0
        });
        return;
      }

      if (currentTaskTitle === task.title) return;

      currentTaskTitle = task.title;
      const saved = persistence.load(task.title);

      store.set({
        task,
        vertexShader: saved?.vertex ?? task.starterVertexShader,
        fragmentShader: saved?.fragment ?? task.starterFragmentShader,
        activeTab: saved?.tab ?? (task.type === '3D' ? 'vertex' : 'fragment'),
        shaderErrors: { vertex: [], fragment: [] },
        _version: Date.now()
      });
    },

    setVertexShader(code: string) {
      store.update(s => {
        if (!s.task || s.vertexShader === code) return s;
        const newState = { ...s, vertexShader: code, _version: Date.now() };
        persistence.save(s.task.title, code, s.fragmentShader, s.activeTab);
        return newState;
      });
    },

    setFragmentShader(code: string) {
      store.update(s => {
        if (!s.task || s.fragmentShader === code) return s;
        const newState = { ...s, fragmentShader: code, _version: Date.now() };
        persistence.save(s.task.title, s.vertexShader, code, s.activeTab);
        return newState;
      });
    },

    setActiveTab(tab: 'vertex' | 'fragment') {
      store.update(s => {
        if (!s.task || s.activeTab === tab) return s;
        const newState = { ...s, activeTab: tab, _version: Date.now() };
        persistence.save(s.task.title, s.vertexShader, s.fragmentShader, tab);
        return newState;
      });
    },

    resetShader(type: 'vertex' | 'fragment') {
      store.update(s => {
        if (!s.task) return s;

        const vertexShader = type === 'vertex' ? s.task.starterVertexShader : s.vertexShader;
        const fragmentShader = type === 'fragment' ? s.task.starterFragmentShader : s.fragmentShader;

        // Save updated values
        persistence.save(s.task.title, vertexShader, fragmentShader, s.activeTab);

        // Return updated state
        return { ...s, vertexShader, fragmentShader, _version: Date.now() };
      });
    },

    setShaderErrors(errors: { vertex?: GLSLError[]; fragment?: GLSLError[] }) {
      store.update(s => ({
        ...s,
        shaderErrors: {
          vertex: errors.vertex ? errors.vertex.map(e => ({ ...e })) : s.shaderErrors.vertex.map(e => ({ ...e })),
          fragment: errors.fragment ? errors.fragment.map(e => ({ ...e })) : s.shaderErrors.fragment.map(e => ({ ...e }))
        },
        _version: Date.now()
      }));
    },

    clearShaderErrors() {
      store.update(s => ({
        ...s,
        shaderErrors: { vertex: [], fragment: [] },
        _version: Date.now()
      }));
    },

    reset() {
      currentTaskTitle = null;
      store.set({
        task: null,
        vertexShader: '',
        fragmentShader: '',
        activeTab: 'fragment',
        shaderErrors: { vertex: [], fragment: [] },
        _version: 0
      });
    },

    // ---------------- Derived ----------------
    currentShader: derived(store, $s => $s.activeTab === 'vertex' ? $s.vertexShader : $s.fragmentShader),
    currentShaderErrors: derived(store, $s => $s.shaderErrors[$s.activeTab]),
    currentTab: derived(store, $s => $s.activeTab)
  };
}

export const taskStore = createTaskStore();
