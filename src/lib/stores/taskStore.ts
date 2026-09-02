import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import { tasks } from '$lib/content';
import { slugify } from '$lib/utils/slugify';
import type { ShaderInput } from '$lib/renderer/ShaderTaskMaterial';
import type { Scene, SceneDefinition, ViewportOverlays } from '$lib/renderer/Renderer';

export interface Task {
	title: string;
	category?: string;
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
	scenes?: SceneDefinition[];
	overlays?: ViewportOverlays;
	showTimeControl?: boolean;
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

interface UserWorkspace {
	taskSlug: string;
	userCode: Partial<Record<ShaderStage, string>>;
	activeTab: 'vertex' | 'fragment';
	cameraPose: CameraPose;
}

interface TaskState {
	task: Task | null;
	vertexShader: string;
	fragmentShader: string;
	activeTab: 'vertex' | 'fragment';
	shaderErrors: { vertex: GLSLError[]; fragment: GLSLError[] };
	cameraPose: CameraPose;
	cameraPoseSaved: boolean;
}

const STORAGE_KEY = 'shaderlab:user-workspaces:v1';

function defaultCameraPose(): CameraPose {
	return { position: [0, 0, 1], quaternion: [0, 0, 0, 1], target: [0, 0, 0], fov: 30 };
}

export function taskCameraPose(task: Task): CameraPose {
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
	return Object.keys(value).every(key => allowed.includes(key));
}

function isUserCode(value: unknown): value is UserWorkspace['userCode'] {
	if (!isRecord(value) || !hasOnlyKeys(value, ['vertex', 'fragment'])) return false;
	const code = value as Partial<UserWorkspace['userCode']>;
	return (code.vertex === undefined || typeof code.vertex === 'string')
		&& (code.fragment === undefined || typeof code.fragment === 'string');
}

function isStoredUserWorkspace(value: unknown): value is UserWorkspace {
	if (!isRecord(value) || !hasOnlyKeys(value, ['taskSlug', 'userCode', 'activeTab', 'cameraPose'])) return false;
	const workspace = value as Partial<UserWorkspace>;
	return typeof workspace.taskSlug === 'string'
		&& isUserCode(workspace.userCode)
		&& (workspace.activeTab === 'vertex' || workspace.activeTab === 'fragment')
		&& isCameraPose(workspace.cameraPose);
}

function isUserWorkspace(value: unknown, slug: string): value is UserWorkspace {
	return isStoredUserWorkspace(value)
		&& value.taskSlug === slug;
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
		cameraPoseSaved: false
	};
}

function createPersistence() {
	let autoSaveTimeout: ReturnType<typeof setTimeout> | null = null;
	let workspaces: Record<string, UserWorkspace> = {};

	function flush() {
		if (!browser) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(workspaces));
		} catch (error) {
			console.error('Failed to save workspaces:', error);
		}
	}

	function scheduleSave(workspace: UserWorkspace) {
		if (!browser) return;
		workspaces[workspace.taskSlug] = workspace;
		if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
		autoSaveTimeout = setTimeout(flush, 300);
	}

	if (browser) {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			const parsed = raw ? JSON.parse(raw) : {};
			if (isRecord(parsed)) {
				workspaces = Object.fromEntries(
					Object.entries(parsed).filter((entry): entry is [string, UserWorkspace] => isStoredUserWorkspace(entry[1]))
				);
			}
		} catch (error) {
			console.error('Failed to load saved workspaces:', error);
		}
		window.addEventListener('pagehide', flush);
	}

	return {
		get: (slug: string) => isUserWorkspace(workspaces[slug], slug) ? workspaces[slug] : null,
		scheduleSave
	};
}

function createTaskStore() {
	const store = writable<TaskState>(emptyState());
	const persistence = createPersistence();
	let currentTaskTitle: string | null = null;

	function snapshot(state: TaskState): UserWorkspace | null {
		if (!state.task) return null;
		const userCode: UserWorkspace['userCode'] = {};
		if (state.vertexShader !== state.task.starterVertexShader) userCode.vertex = state.vertexShader;
		if (state.fragmentShader !== state.task.starterFragmentShader) userCode.fragment = state.fragmentShader;
		return {
			taskSlug: slugify(state.task.title),
			userCode,
			activeTab: state.activeTab,
			cameraPose: state.cameraPose
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
				vertexShader: saved?.userCode.vertex ?? task.starterVertexShader,
				fragmentShader: saved?.userCode.fragment ?? task.starterFragmentShader,
				activeTab: saved?.activeTab && getTaskShaderStages(task).includes(saved.activeTab)
					? saved.activeTab
					: getTaskShaderStages(task)[0],
				shaderErrors: { vertex: [], fragment: [] },
				cameraPose: saved?.cameraPose ?? taskCameraPose(task),
				cameraPoseSaved: Boolean(saved)
			});
		},

		setVertexShader(code: string) {
			store.update(state => {
				if (!state.task || state.vertexShader === code) return state;
				const next = { ...state, vertexShader: code };
				persist(next);
				return next;
			});
		},

		setFragmentShader(code: string) {
			store.update(state => {
				if (!state.task || state.fragmentShader === code) return state;
				const next = { ...state, fragmentShader: code };
				persist(next);
				return next;
			});
		},

		setActiveTab(tab: 'vertex' | 'fragment') {
			store.update(state => {
				if (!state.task || state.activeTab === tab) return state;
				const next = { ...state, activeTab: tab };
				persist(next);
				return next;
			});
		},

		setCameraPose(cameraPose: CameraPose) {
			store.update(state => {
				if (!state.task || (state.cameraPoseSaved && JSON.stringify(state.cameraPose) === JSON.stringify(cameraPose))) return state;
				const next = { ...state, cameraPose, cameraPoseSaved: true };
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
					fragmentShader: type === 'fragment' ? state.task.starterFragmentShader : state.fragmentShader
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
					}
				};
				return next;
			});
		},

		clearShaderErrors() {
			store.update(state => {
				const next = { ...state, shaderErrors: { vertex: [], fragment: [] } };
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
