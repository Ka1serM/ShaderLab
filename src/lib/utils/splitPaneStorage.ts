import { browser } from '$app/environment';

export type SplitterSizes = {
    outer: number;
    inner: number;
    viewports: number;
};

function isValidSize(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

export function loadSplitterSizes(key: string, fallback: SplitterSizes): SplitterSizes {
    if (!browser) return fallback;

    try {
        const stored = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<SplitterSizes> | null;
        return {
            outer: isValidSize(stored?.outer) ? stored?.outer : fallback.outer,
            inner: isValidSize(stored?.inner) ? stored?.inner : fallback.inner,
            viewports: isValidSize(stored?.viewports) ? stored?.viewports : fallback.viewports
        };
    } catch {
        return fallback;
    }
}

export function saveSplitterSizes(key: string, sizes: SplitterSizes) {
    if (!browser) return;

    try {
        localStorage.setItem(key, JSON.stringify(sizes));
    } catch {
        // Storage can be disabled or full; the layout still works for this session.
    }
}

export type PaneSizes = number[];

export function loadPaneSizes(key: string, fallback: PaneSizes): PaneSizes {
    if (!browser) return fallback;

    try {
        const stored = JSON.parse(localStorage.getItem(key) ?? 'null') as number[] | null;
        if (Array.isArray(stored) && stored.every(s => typeof s === 'number' && Number.isFinite(s) && s > 0)) {
            return stored;
        }
    } catch {
        // fall through
    }
    return fallback;
}

export function savePaneSizes(key: string, sizes: PaneSizes) {
    if (!browser) return;

    try {
        localStorage.setItem(key, JSON.stringify(sizes));
    } catch {
        // Storage can be disabled or full; the layout still works for this session.
    }
}