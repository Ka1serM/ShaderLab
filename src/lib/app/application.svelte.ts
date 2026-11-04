import { getContext, setContext } from 'svelte';
import { LayoutController } from './controllers/layout.svelte';
import { TaskController } from './controllers/task.svelte';
import { TeachingController } from './controllers/teaching.svelte';
import { ViewportSlot } from './controllers/viewport.svelte';
import { EditorHost } from './services/editor.svelte';
import { Persistence } from './services/persistence';
import type { Task, Teach } from './types';

export class Application {
  readonly persistence = new Persistence();
  readonly editor = new EditorHost(this.persistence);
  readonly viewports = { reference: new ViewportSlot(), output: new ViewportSlot() };
  readonly layout = new LayoutController(this.persistence);
  readonly task = new TaskController(this.persistence, this.editor, this.viewports.reference, this.viewports.output);
  readonly teaching = new TeachingController(this.persistence, this.editor, this.viewports.output);

  openTask(slug: string, task: Task) {
    this.teaching.close();
    this.layout.open(`task:${slug}`, 'task');
    this.task.open(slug, task);
  }

  openTeaching(slug: string, definition: Teach) {
    this.task.close();
    this.layout.open(`teaching:${slug}`, 'teaching');
    this.teaching.open(definition);
  }

  closeWorkspaces() {
    this.task.close();
    this.teaching.close();
    this.layout.close();
    this.persistence.flush();
  }
}

const KEY = Symbol('application');

export function provideApplication(app: Application) {
  setContext(KEY, app);
  return app;
}

export function useApplication(): Application {
  const app = getContext<Application | undefined>(KEY);
  if (!app) throw new Error('useApplication() needs the Application from the root layout.');
  return app;
}
