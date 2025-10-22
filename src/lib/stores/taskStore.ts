// src/lib/stores/taskStore.ts
import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';

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

export interface LessonState {
  task: Task | null;
  vertexShader: string;
  fragmentShader: string;
  activeTab: 'vertex' | 'fragment';
}

function createTaskStore() {
  const task = writable<Task | null>(null);
  const vertexShader = writable<string>('');
  const fragmentShader = writable<string>('');
  const activeTab = writable<'vertex' | 'fragment'>('fragment');

  // Track if we're currently loading to prevent saving during init
  let isLoading = false;
  let storageUnsubscribe: (() => void) | null = null;

  // Derived store combining all fields
  const store = derived(
    [task, vertexShader, fragmentShader, activeTab],
    ([$task, $vertex, $fragment, $tab]) => ({
      task: $task,
      vertexShader: $vertex,
      fragmentShader: $fragment,
      activeTab: $tab
    })
  );

  function storageKey(task: Task, field: 'vertex' | 'fragment' | 'activeTab') {
    return `shader-progress-${task.title.replace(/\s+/g, '_')}-${field}`;
  }

  function setupAutoSave(t: Task) {
    // Clean up previous auto-save subscription if it exists
    if (storageUnsubscribe) {
      storageUnsubscribe();
    }

    // Auto-save to localStorage whenever values change (but not during loading)
    storageUnsubscribe = derived(
      [vertexShader, fragmentShader, activeTab],
      ([$vertex, $fragment, $tab]) => ({ $vertex, $fragment, $tab })
    ).subscribe(({ $vertex, $fragment, $tab }) => {
      if (!browser || isLoading) return;
      
      try {
        localStorage.setItem(storageKey(t, 'vertex'), $vertex);
        localStorage.setItem(storageKey(t, 'fragment'), $fragment);
        localStorage.setItem(storageKey(t, 'activeTab'), $tab);
      } catch (e) {
        console.error('Failed to save to localStorage:', e);
      }
    });
  }

  return {
    task,
    vertexShader,
    fragmentShader,
    activeTab,
    subscribe: store.subscribe,

    init(t: Task) {
      if (!browser) return;

      isLoading = true;

      // Load from localStorage or use starter code
      const savedVertex = localStorage.getItem(storageKey(t, 'vertex'));
      const savedFragment = localStorage.getItem(storageKey(t, 'fragment'));
      const savedTab = localStorage.getItem(storageKey(t, 'activeTab')) as 'vertex' | 'fragment' | null;

      const vertex = savedVertex !== null ? savedVertex : t.starterVertexShader;
      const fragment = savedFragment !== null ? savedFragment : t.starterFragmentShader;
      const tab = savedTab ?? (t.type === '3D' ? 'vertex' : 'fragment');

      // Set all values
      task.set(t);
      vertexShader.set(vertex);
      fragmentShader.set(fragment);
      activeTab.set(tab);

      // Setup auto-save for this task
      setupAutoSave(t);

      // Allow saving after initial load
      setTimeout(() => {
        isLoading = false;
      }, 0);
    },

    setVertexShader(code: string) {
      const current = get(vertexShader);
      if (current !== code) {
        vertexShader.set(code);
      }
    },

    setFragmentShader(code: string) {
      const current = get(fragmentShader);
      if (current !== code) {
        fragmentShader.set(code);
      }
    },

    setActiveTab(tab: 'vertex' | 'fragment') {
      const current = get(activeTab);
      if (current !== tab) {
        activeTab.set(tab);
      }
    },

    resetShader(type: 'vertex' | 'fragment') {
      const t = get(task);
      if (!t) return;

      if (type === 'vertex') {
        vertexShader.set(t.starterVertexShader);
      } else {
        fragmentShader.set(t.starterFragmentShader);
      }
    },

    destroy() {
      if (storageUnsubscribe) {
        storageUnsubscribe();
        storageUnsubscribe = null;
      }
      
      task.set(null);
      vertexShader.set('');
      fragmentShader.set('');
      activeTab.set('fragment');
    }
  };
}

export const taskStore = createTaskStore();