import { writable } from 'svelte/store';
import { TaskSession } from '../models/TaskSession.js';

export const taskStore = writable(null);

export function loadTask(taskData) {
  if (!taskData) {
    taskStore.set(null);
    return;
  }

  const cached = (key, fallback) => {
    const val = localStorage.getItem(`task-${taskData.title}-${key}`);
    if (!val) return fallback; // covers null, undefined, empty string
    if (key === 'inputs') {
      try {
        return JSON.parse(val);
      } catch (err) {
        console.warn(`Failed to parse localStorage key task-${taskData.title}-${key}`, val);
        return fallback;
      }
    }
    return val;
  };

  const session = new TaskSession({
    vertexShader: cached('vertexShader', taskData.starterVertexShader),
    fragmentShader: cached('fragmentShader', taskData.starterFragmentShader),
    activeTab: cached('activeTab', taskData.type === '3D' ? 'vertex' : 'fragment'),
    inputs: cached('inputs', taskData.inputs)
  });

  // persist session changes
  session.vertexShader.subscribe(v =>
    localStorage.setItem(`task-${taskData.title}-vertexShader`, v)
  );
  session.fragmentShader.subscribe(f =>
    localStorage.setItem(`task-${taskData.title}-fragmentShader`, f)
  );
  session.activeTab.subscribe(a =>
    localStorage.setItem(`task-${taskData.title}-activeTab`, a)
  );
  session.inputs.subscribe(i =>
    localStorage.setItem(`task-${taskData.title}-inputs`, JSON.stringify(i))
  );

  // only the top-level taskStore needs to be writable
  taskStore.set({ task: taskData, session });
}