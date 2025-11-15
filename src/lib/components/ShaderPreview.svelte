<script lang="ts">
  import { onMount, onDestroy, afterUpdate } from 'svelte';
  import * as THREE from 'three';
  import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
  import { taskStore, type Task, type GLSLError } from '$lib/stores/taskStore';
  import { base } from '$app/paths';
  import { ShaderTaskMaterial, type ShaderInput } from '$lib/renderer/ShaderTaskMaterial';

  export let task: Task;
  export let vertexShader: string;
  export let fragmentShader: string;
  export let sharedCameraRef: THREE.PerspectiveCamera | null = null;
  export let sharedTargetRef: THREE.Vector3 | null = null;

  let container: HTMLDivElement;
  let scene: THREE.Scene;
  let renderer: THREE.WebGLRenderer;
  let camera: THREE.PerspectiveCamera;
  let shaderMaterial: ShaderTaskMaterial;
  let mesh: THREE.InstancedMesh | null = null;
  let clock: THREE.Clock;
  let controls: OrbitControls | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let animationFrameId: number | null = null;
  let isDestroyed = false;

  // --- Explicit State Tracking ---
  // We will manually track the previous state of the props
  // to decide what to update.
  let previousTaskTitle = '';
  let previousVertexShader = '';
  let previousFragmentShader = '';

  /* ---------------------------- Initialization ---------------------------- */
  function initRenderer() {
  	if (!container || isDestroyed) return;
  	scene = new THREE.Scene();

  	// Camera setup
  	const aspect = container.clientWidth / container.clientHeight;
  	camera = sharedCameraRef ?? new THREE.PerspectiveCamera(30, aspect, 0.1, 1000);
  	camera.position.set(0, 0, 1);
  	camera.aspect = aspect;
  	camera.updateProjectionMatrix();
  	if (!sharedCameraRef) sharedCameraRef = camera;

  	// Renderer setup
  	renderer = new THREE.WebGLRenderer({
  		antialias: true,
  	});
  	renderer.setPixelRatio(window.devicePixelRatio);
  	renderer.setSize(container.clientWidth, container.clientHeight, false);
  	renderer.domElement.style.cssText = 'width: 100%; height: 100%; display: block;';
  	container.appendChild(renderer.domElement);

  	// Enable shader debugging
  	renderer.debug.checkShaderErrors = true;

  	// GLSL error log parser
  	const GLSL_LINE_OFFSET = 3; // This accounts for boilerplate added by ShaderTaskMaterial

  	const parseGLSLLog = (log: string, type: 'vertex' | 'fragment'): GLSLError[] => {
  		return log
  			.split('\n')
  			.map(line => {
  				const match =
  					line.match(/ERROR:\s0:(\d+):\s(.*)/) ||
  					line.match(/WARNING:\s0:(\d+):\s(.*)/);
  				if (!match) return null;

  				const originalLine = parseInt(match[1], 10);
  				const adjustedLine = Math.max(1, originalLine - GLSL_LINE_OFFSET);
  				const message = match[2]; 

  				console.warn(`$[${type}] (line ${adjustedLine}): ${message}`);

  				return {
  					type: line.startsWith('WARNING') ? 'warning' : 'error',
  					line: adjustedLine,
  					message,
  					timestamp: Date.now() // ensure uniqueness
  				};
  			})
  			.filter(Boolean) as GLSLError[];
  	};

  	// Hook into shader compilation errors
  	renderer.debug.onShaderError = (gl, program, glVertexShader, glFragmentShader) => {
  		const vertexLog = gl.getShaderInfoLog(glVertexShader) || '';
  		const fragmentLog = gl.getShaderInfoLog(glFragmentShader) || '';

  		taskStore.setShaderErrors({
  			vertex: parseGLSLLog(vertexLog, 'vertex'),
  			fragment: parseGLSLLog(fragmentLog, 'fragment')
  		});
  	};

  	// Setup clock & controls
  	clock = new THREE.Clock();
  	controls = new OrbitControls(camera, renderer.domElement);
  	controls.enableDamping = true;
  	controls.dampingFactor = 0.05;
  	controls.minDistance = 0;
  	controls.maxDistance = 50;
  	controls.maxPolarAngle = Math.PI;

  	if (sharedTargetRef) controls.target.copy(sharedTargetRef);
  	else sharedTargetRef = controls.target.clone();

  	controls.update();

  	// Resize observer
  	resizeObserver = new ResizeObserver(handleResize);
  	resizeObserver.observe(container);

  	// Load mesh & start loop
  	loadMeshForTask();
  	animate();
  }

  function handleResize() {
  	if (!container || !renderer || !camera || isDestroyed) return;
  	const width = container.clientWidth;
  	const height = container.clientHeight;

  	renderer.setSize(width, height, false);
  	camera.aspect = width / height;
  	camera.updateProjectionMatrix();

  	if (shaderMaterial) {
  		shaderMaterial.setInput('iResolution', [
  			renderer.domElement.width,
  			renderer.domElement.height
  		]);
  	}

  	renderer.render(scene, camera);
  }

  /* ---------------------------- Animation Loop ---------------------------- */
  function animate() {
  	if (isDestroyed) return;
  	animationFrameId = requestAnimationFrame(animate);
  	if (!renderer || !scene || !camera) return;

  	controls?.update();

  	if (shaderMaterial) {
  		shaderMaterial.setInput('time', clock.getElapsedTime());
  		shaderMaterial.setInput('cameraPosition', camera.position.toArray());
  		shaderMaterial.setInput('cameraDirection', camera.getWorldDirection(new THREE.Vector3()).toArray());
  		shaderMaterial.setInput('cameraFov', camera.fov * (Math.PI / 180));
  	}

  	renderer.render(scene, camera);
  }

  /* ---------------------------- Mesh Management ---------------------------- */
  function loadMeshForTask() {
  	if (!task || !scene || isDestroyed) return;

  	if (mesh) {
  		scene.remove(mesh);
  		mesh.geometry.dispose();
  		mesh = null;
  	}

  	// Dispose old material before creating a new one to prevent leaks
  	if (shaderMaterial) {
  		shaderMaterial.dispose();
  	}

  	createShaderMaterial();

  	if (task.type === '3D' && task.modelPath) loadGLTFModel();
  	else createMesh(new THREE.PlaneGeometry(2, 2));

  	// We track the title to know if we need to reload the mesh
  	previousTaskTitle = task.title;
  }

  function createShaderMaterial() {
  	if (!container || !camera || isDestroyed) return;

  	const defaultInputs: ShaderInput[] = [
  		{ type: 'float' as const, name: 'time', init: 0 },
  		{ type: 'vec2' as const, name: 'iResolution', init: [
  			container.clientWidth * window.devicePixelRatio,
  			container.clientHeight * window.devicePixelRatio
  		]},
  		{ type: 'float' as const, name: 'cameraFov', init: camera.fov * (Math.PI / 180) },
  		{ type: 'vec3' as const, name: 'cameraPosition', init: [camera.position.x, camera.position.y, camera.position.z] },
  		{ type: 'vec3' as const, name: 'cameraDirection', init: camera.getWorldDirection(new THREE.Vector3()).toArray() }
  	];

  	// Combine default inputs with task-specific inputs
  	const inputs = [...defaultInputs, ...(task.inputs || [])];

  	shaderMaterial = new ShaderTaskMaterial({
  		vertexShader,
  		fragmentShader,
  		inputs
  	});
  	
  	// We track the shaders to know if we need to recompile
  	previousVertexShader = vertexShader;
  	previousFragmentShader = fragmentShader;
  }

  function loadGLTFModel() {
  	// CRITICAL FIX: Capture the task title at the moment the load is initiated.
  	// This ensures that if the user switches tasks before the model loads, 
  	// we can check if this mesh is still relevant.
  	const expectedTaskTitle = task.title; 

  	const loader = new GLTFLoader();
  	loader.load(
  		`${base}/${task.modelPath}`,
  		(gltf) => {
  			if (isDestroyed || expectedTaskTitle !== task.title) {
  				// ABORT: The task has changed (or component destroyed) while loading.
  				return; 
  			}

  			let foundGeometry: THREE.BufferGeometry | null = null;
  			gltf.scene.traverse((child) => {
  				if ((child as THREE.Mesh).isMesh && !foundGeometry) {
  					foundGeometry = (child as THREE.Mesh).geometry;
  				}
  			});

  			createMesh(foundGeometry ?? new THREE.BoxGeometry(1, 1, 1));
  		},
  		undefined,
  		(error) => {
  			console.error('Model loading error:', error);
  			createMesh(new THREE.BoxGeometry(1, 1, 1));
  		}
  	);
  }

  function createMesh(geometry: THREE.BufferGeometry) {
  	if (isDestroyed || !scene || !shaderMaterial) return;

  	// NOTE: loadMeshForTask() is responsible for cleaning up the previous mesh.
  	// We only assign the new mesh here.
  	mesh = new THREE.InstancedMesh(
  		geometry,
  		shaderMaterial,
  		task.instanceCount ?? 1
  	);
  	scene.add(mesh);
  }

  /* ---------------------------- Hot Shader Updates ---------------------------- */
  function updateShaders() {
  	if (isDestroyed || !shaderMaterial) return;
  	
  	// No guard needed here, the afterUpdate hook handles the check.
  	
  	// Clear old errors before recompilation
  	taskStore.clearShaderErrors();

  	try {
  		// This call recompiles the shader material
  		shaderMaterial.updateShaders(vertexShader, fragmentShader);

  		// Update our trackers
  		previousVertexShader = vertexShader;
  		previousFragmentShader = fragmentShader;
  	} catch (e) {
  		console.error("Error during shader update:", e);
  	}
  }
 
/* ---------------------------- Cleanup ---------------------------- */
  function cleanup() {
  	isDestroyed = true;
  	if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);

  	resizeObserver?.disconnect();
  	controls?.dispose();

  	if (mesh) {
  		scene.remove(mesh);
  		mesh.geometry.dispose();
  		mesh = null;
  	}

  	// Use a local variable for shaderMaterial to avoid null check issues
  	const mat = shaderMaterial;
  	if (mat) {
  		mat.dispose();
  	}
  	shaderMaterial = null;

  	if (renderer) {
  		renderer.dispose();
  		if (renderer.domElement && container?.contains(renderer.domElement)) {
  			container.removeChild(renderer.domElement);
  		}
  		// renderer = null; // Removed assignment to null
  	}

  	scene = null;
  	camera = null;
  }

  /* ---------------------------- Lifecycle ---------------------------- */
  
  onMount(() => {
  	initRenderer();
  	// Store initial state
  	previousTaskTitle = task.title;
  	previousVertexShader = vertexShader;
  	previousFragmentShader = fragmentShader;
  });

  afterUpdate(() => {
  	// This hook runs *after* props have been updated.
  	if (isDestroyed || !task) return;

  	// Check 1: Has the task itself changed?
  	// If so, we must reload the mesh and material.
  	if (task.title !== previousTaskTitle) {
  		loadMeshForTask(); 
  		// loadMeshForTask() will update the 'previous' trackers itself
  		return;
  	}

  	// Check 2: Has *only* the shader code changed?
  	// If so, just recompile the existing material.
  	if (
  		vertexShader !== previousVertexShader ||
  		fragmentShader !== previousFragmentShader
  	) {
  		updateShaders();
  	}
  });

  onDestroy(() => {
  	cleanup();
  });
</script>

<div
  bind:this={container}
  class="absolute inset-0 w-full h-full bg-background rounded-xl overflow-hidden"
></div>