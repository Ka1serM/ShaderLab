import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import tasks from '$lib/data/tasks.json';
import { slugify } from '$lib/utils/slugify';
import type { ShaderInput } from '$lib/renderer/ShaderTaskMaterial';
import type { Scene, ViewportOverlays } from '$lib/renderer/Renderer';

export interface Task {
	title: string;
	task: string;
	theory: string;
	hints: string[];
	starterVertexShader: string;
	starterFragmentShader: string;
	starterVertexShaderTemplate?: ShaderTemplate;
	starterFragmentShaderTemplate?: ShaderTemplate;
	referenceVertexShader: string;
	referenceFragmentShader: string;
	modelPath: string;
	type: '2D' | '3D';
	shaderStages?: ShaderStage[];
	camera?: TaskCamera;
	instanceCount?: number;
	inputs?: ShaderInput[];
	scene?: Scene;
	overlays?: ViewportOverlays;
}

export interface ShaderTemplate {
	prefix: string;
	suffix: string;
}

export function assembleStudentShader(source: string, template?: ShaderTemplate) {
	if (!template) return source;
	return [template.prefix, source, template.suffix].filter(Boolean).join('\n');
}

export interface GLSLError {
	type: 'error' | 'warning';
	line: number;
	message: string;
	timestamp?: number;
}

export type ShaderStage = 'vertex' | 'fragment';

export interface TaskCamera {
	position?: number[];
	quaternion?: number[];
	target?: number[];
	fov?: number;
}

export interface CameraPose {
	position: [number, number, number];
	quaternion: [number, number, number, number];
	target: [number, number, number];
	fov: number;
}

export interface TaskWorkspace {
	taskSlug: string;
	vertexShader: string;
	fragmentShader: string;
	activeTab: 'vertex' | 'fragment';
	cameraPose: CameraPose;
	shaderErrors: { vertex: GLSLError[]; fragment: GLSLError[] };
	updatedAt: number;
}

interface TaskState {
	task: Task | null;
	vertexShader: string;
	fragmentShader: string;
	activeTab: 'vertex' | 'fragment';
	shaderErrors: { vertex: GLSLError[]; fragment: GLSLError[] };
	cameraPose: CameraPose;
	_version: number;
}

const STORAGE_KEY = 'shaderlab:workspaces';

function defaultCameraPose(): CameraPose {
	return { position: [0, 0, 1], quaternion: [0, 0, 0, 1], target: [0, 0, 0], fov: 30 };
}

function taskCameraPose(task: Task): CameraPose {
	const camera = task.camera;
	return {
		position: (camera?.position?.length === 3 ? camera.position : [0, 0, 1]) as CameraPose['position'],
		quaternion: (camera?.quaternion?.length === 4 ? camera.quaternion : [0, 0, 0, 1]) as CameraPose['quaternion'],
		target: (camera?.target?.length === 3 ? camera.target : [0, 0, 0]) as CameraPose['target'],
		fov: camera?.fov ?? 30
	};
}

function isCameraPose(value: unknown): value is CameraPose {
	if (!value || typeof value !== 'object') return false;
	const pose = value as Partial<CameraPose>;
	return Array.isArray(pose.position) && pose.position.length === 3 && pose.position.every(Number.isFinite)
		&& Array.isArray(pose.quaternion) && pose.quaternion.length === 4 && pose.quaternion.every(Number.isFinite)
		&& Array.isArray(pose.target) && pose.target.length === 3 && pose.target.every(Number.isFinite)
		&& typeof pose.fov === 'number' && Number.isFinite(pose.fov);
}

function isTaskWorkspace(value: unknown, slug: string): value is TaskWorkspace {
	if (!value || typeof value !== 'object') return false;
	const workspace = value as Partial<TaskWorkspace>;
	return workspace.taskSlug === slug
		&& typeof workspace.vertexShader === 'string'
		&& typeof workspace.fragmentShader === 'string'
		&& (workspace.activeTab === 'vertex' || workspace.activeTab === 'fragment')
		&& isCameraPose(workspace.cameraPose)
		&& !!workspace.shaderErrors
		&& Array.isArray(workspace.shaderErrors.vertex)
		&& Array.isArray(workspace.shaderErrors.fragment);
}

export function getTaskShaderStages(task: Task): ShaderStage[] {
	return task.shaderStages ?? (task.type === '3D' ? ['vertex', 'fragment'] : ['fragment']);
}

function emptyState(): TaskState {
	return {
		task: null,
		vertexShader: '',
		fragmentShader: '',
		activeTab: 'fragment',
		shaderErrors: { vertex: [], fragment: [] },
		cameraPose: defaultCameraPose(),
		_version: 0
	};
}

function createPersistence() {
	let autoSaveTimeout: ReturnType<typeof setTimeout> | null = null;
	let workspaces: Record<string, TaskWorkspace> = {};

	function flush() {
		if (!browser) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(workspaces));
		} catch (error) {
			console.error('Failed to save workspaces:', error);
		}
	}

	function scheduleSave(workspace: TaskWorkspace) {
		if (!browser) return;
		workspaces[workspace.taskSlug] = workspace;
		if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
		autoSaveTimeout = setTimeout(flush, 300);
	}

	if (browser) {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			const parsed = raw ? JSON.parse(raw) : {};
			workspaces = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
		} catch (error) {
			console.error('Failed to load saved workspaces:', error);
		}
		window.addEventListener('pagehide', flush);
	}

	return {
		get: (slug: string) => isTaskWorkspace(workspaces[slug], slug) ? workspaces[slug] : null,
		scheduleSave
	};
}

function createTaskStore() {
	const store = writable<TaskState>(emptyState());
	const persistence = createPersistence();
	let currentTaskTitle: string | null = null;

	function snapshot(state: TaskState): TaskWorkspace | null {
		if (!state.task) return null;
		return {
			taskSlug: slugify(state.task.title),
			vertexShader: state.vertexShader,
			fragmentShader: state.fragmentShader,
			activeTab: state.activeTab,
			cameraPose: state.cameraPose,
			shaderErrors: state.shaderErrors,
			updatedAt: Date.now()
		};
	}

	function persist(state: TaskState) {
		const workspace = snapshot(state);
		if (workspace) persistence.scheduleSave(workspace);
	}

	return {
		subscribe: store.subscribe,

		loadTask(slug: string) {
			if (!browser) return;
			const normalizedSlug = slugify(slug);
			const task = (tasks as Task[]).find(t => slugify(t.title) === normalizedSlug);
			if (!task) {
				console.error('Task not found for slug:', slug);
				currentTaskTitle = null;
				store.set(emptyState());
				return;
			}
			if (currentTaskTitle === task.title) return;

			store.update(state => {
				persist(state);
				return state;
			});
			currentTaskTitle = task.title;
			const saved = persistence.get(normalizedSlug);
			store.set({
				task,
				vertexShader: saved?.vertexShader ?? task.starterVertexShader,
				fragmentShader: saved?.fragmentShader ?? task.starterFragmentShader,
				activeTab: saved?.activeTab && getTaskShaderStages(task).includes(saved.activeTab)
					? saved.activeTab
					: getTaskShaderStages(task)[0],
				shaderErrors: saved?.shaderErrors ?? { vertex: [], fragment: [] },
				cameraPose: saved?.cameraPose ?? taskCameraPose(task),
				_version: Date.now()
			});
		},

		setVertexShader(code: string) {
			store.update(state => {
				if (!state.task || state.vertexShader === code) return state;
				const next = { ...state, vertexShader: code, _version: Date.now() };
				persist(next);
				return next;
			});
		},

		setFragmentShader(code: string) {
			store.update(state => {
				if (!state.task || state.fragmentShader === code) return state;
				const next = { ...state, fragmentShader: code, _version: Date.now() };
				persist(next);
				return next;
			});
		},

		setActiveTab(tab: 'vertex' | 'fragment') {
			store.update(state => {
				if (!state.task || state.activeTab === tab) return state;
				const next = { ...state, activeTab: tab, _version: Date.now() };
				persist(next);
				return next;
			});
		},

		setCameraPose(cameraPose: CameraPose) {
			store.update(state => {
				if (!state.task) return state;
				const next = { ...state, cameraPose, _version: Date.now() };
				persist(next);
				return next;
			});
		},

		resetShader(type: 'vertex' | 'fragment') {
			store.update(state => {
				if (!state.task) return state;
				const next = {
					...state,
					vertexShader: type === 'vertex' ? state.task.starterVertexShader : state.vertexShader,
					fragmentShader: type === 'fragment' ? state.task.starterFragmentShader : state.fragmentShader,
					_version: Date.now()
				};
				persist(next);
				return next;
			});
		},

		setShaderErrors(errors: { vertex?: GLSLError[]; fragment?: GLSLError[] }) {
			store.update(state => {
				const next = {
					...state,
					shaderErrors: {
						vertex: errors.vertex ? errors.vertex.map(error => ({ ...error, timestamp: Date.now() })) : state.shaderErrors.vertex,
						fragment: errors.fragment ? errors.fragment.map(error => ({ ...error, timestamp: Date.now() })) : state.shaderErrors.fragment
					},
					_version: Date.now()
				};
				persist(next);
				return next;
			});
		},

		clearShaderErrors() {
			store.update(state => {
				const next = { ...state, shaderErrors: { vertex: [], fragment: [] }, _version: Date.now() };
				persist(next);
				return next;
			});
		},

		reset() {
			currentTaskTitle = null;
			store.set(emptyState());
		},

		currentShader: derived(store, state => state.activeTab === 'vertex' ? state.vertexShader : state.fragmentShader),
		currentShaderErrors: derived(store, state => state.shaderErrors[state.activeTab]),
		currentTab: derived(store, state => state.activeTab)
	};
}

export const taskStore = createTaskStore();
