// src/lib/stores/taskStore.ts
import { writable, get } from 'svelte/store';
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

function createTaskStore() {
  const { subscribe, set, update } = writable<{
    task: Task | null;
    vertexShader: string;
    fragmentShader: string;
    activeTab: 'vertex' | 'fragment';
  }>({
    task: null,
    vertexShader: '',
    fragmentShader: '',
    activeTab: 'fragment'
  });

  let autoSaveTimeout: number | null = null;
  let currentTaskTitle: string | null = null;

  function storageKey(taskTitle: string, field: string) {
    return `shader-${taskTitle.replace(/\s+/g, '_')}-${field}`;
  }

  function saveToStorage(taskTitle: string, vertex: string, fragment: string, tab: 'vertex' | 'fragment') {
    if (!browser) return;
    
    // Debounce saves
    if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
    
    autoSaveTimeout = window.setTimeout(() => {
      try {
        localStorage.setItem(storageKey(taskTitle, 'vertex'), vertex);
        localStorage.setItem(storageKey(taskTitle, 'fragment'), fragment);
        localStorage.setItem(storageKey(taskTitle, 'tab'), tab);
      } catch (e) {
        console.error('Failed to save:', e);
      }
    }, 300);
  }

  return {
    subscribe,

    loadTask(slug: string) {
      if (!browser) {
        console.log('Not in browser, skipping loadTask');
        return;
      }

      // Normalize slug for comparison
      const normalizedSlug = slugify(slug);
      
      // Find task by matching normalized title
      const task = (tasks as Task[]).find(t => 
        slugify(t.title) === normalizedSlug
      );

      if (!task) {
        console.error('Task not found for slug:', slug);
        set({
          task: null,
          vertexShader: '',
          fragmentShader: '',
          activeTab: 'fragment'
        });
        return;
      }

      // Skip if same task is already loaded
      if (currentTaskTitle === task.title) {
        console.log('Task already loaded:', task.title);
        return;
      }

      console.log('Loading task:', task.title);
      currentTaskTitle = task.title;

      // Load saved state or use defaults
      let vertex = task.starterVertexShader;
      let fragment = task.starterFragmentShader;
      let tab: 'vertex' | 'fragment' = task.type === '3D' ? 'vertex' : 'fragment';

      try {
        const savedVertex = localStorage.getItem(storageKey(task.title, 'vertex'));
        const savedFragment = localStorage.getItem(storageKey(task.title, 'fragment'));
        const savedTab = localStorage.getItem(storageKey(task.title, 'tab')) as 'vertex' | 'fragment' | null;

        if (savedVertex !== null) vertex = savedVertex;
        if (savedFragment !== null) fragment = savedFragment;
        if (savedTab !== null) tab = savedTab;
      } catch (e) {
        console.error('Failed to load saved state:', e);
      }

      set({
        task,
        vertexShader: vertex,
        fragmentShader: fragment,
        activeTab: tab
      });
    },

    setVertexShader(code: string) {
      const state = get({ subscribe });
      if (!state.task || state.vertexShader === code) return;

      update(s => ({ ...s, vertexShader: code }));
      saveToStorage(state.task.title, code, state.fragmentShader, state.activeTab);
    },

    setFragmentShader(code: string) {
      const state = get({ subscribe });
      if (!state.task || state.fragmentShader === code) return;

      update(s => ({ ...s, fragmentShader: code }));
      saveToStorage(state.task.title, state.vertexShader, code, state.activeTab);
    },

    setActiveTab(tab: 'vertex' | 'fragment') {
      const state = get({ subscribe });
      if (!state.task || state.activeTab === tab) return;

      update(s => ({ ...s, activeTab: tab }));
      saveToStorage(state.task.title, state.vertexShader, state.fragmentShader, tab);
    },

    resetShader(type: 'vertex' | 'fragment') {
      const state = get({ subscribe });
      if (!state.task) return;

      if (type === 'vertex') {
        this.setVertexShader(state.task.starterVertexShader);
      } else {
        this.setFragmentShader(state.task.starterFragmentShader);
      }
    },

    reset() {
      currentTaskTitle = null;
      set({
        task: null,
        vertexShader: '',
        fragmentShader: '',
        activeTab: 'fragment'
      });
    }
  };
}

export const taskStore = createTaskStore();