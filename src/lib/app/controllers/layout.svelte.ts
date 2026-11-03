import { browser } from '$app/environment';
import type { Persistence, SplitterSizes } from '../services/persistence';

export type PanelId = 'instructions' | 'controls' | 'editor' | 'reference' | 'output';
export type Splitter = keyof SplitterSizes;

const TASK_SIZES: SplitterSizes = { outer: 35, inner: 50, viewports: 50 };
const TEACHING_SIZES: SplitterSizes = { outer: 35, inner: 34, viewports: 50 };

/** The workspace layout: splitter positions per page, and which panel is maximised. */
export class LayoutController {
  maximized = $state<PanelId | null>(null);
  sizes = $state<SplitterSizes>({ ...TASK_SIZES });
  private page = '';

  constructor(private readonly persistence: Persistence) {
    if (browser) window.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.maximized) this.maximized = null;
    });
  }

  /** `page` names the storage entry, for example `task:phong` or `teaching:Phong Shading`. */
  open(page: string, kind: 'task' | 'teaching') {
    if (page === this.page) return;
    this.page = page;
    this.maximized = null;
    this.sizes = this.persistence.splitterSizes(page, kind === 'task' ? TASK_SIZES : TEACHING_SIZES);
  }

  close() {
    this.page = '';
    this.maximized = null;
  }

  toggleMaximized(panel: PanelId) {
    this.maximized = this.maximized === panel ? null : panel;
  }

  resize(splitter: Splitter, size: number | undefined) {
    if (!this.page || size === undefined || !Number.isFinite(size) || size < 0 || size > 100) return;
    this.sizes = { ...this.sizes, [splitter]: size };
    this.persistence.saveSplitterSizes(this.page, this.sizes);
  }
}
