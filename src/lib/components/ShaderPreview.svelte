<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as THREE from 'three';
  import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
  import { taskStore, type Task, type GLSLError } from '$lib/stores/taskStore';
  import { base } from '$app/paths';

  export let task: Task;
  export let vertexShader: string;
  export let fragmentShader: string;
  export let sharedCameraRef: THREE.PerspectiveCamera | null = null;
  export let sharedTargetRef: THREE.Vector3 | null = null;

  let container: HTMLDivElement;
  let scene: THREE.Scene;
  let renderer: THREE.WebGLRenderer;
  let camera: THREE.PerspectiveCamera;
  let shaderMaterial: THREE.RawShaderMaterial;
  let mesh: THREE.InstancedMesh | null = null;
  let clock: THREE.Clock;
  let controls: OrbitControls | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let animationFrameId: number | null = null;

  // Guards against redundant updates
  let lastTaskTitle = '';
  let lastVertexShader = '';
  let lastFragmentShader = '';
  let isDestroyed = false;

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
    const GLSL_LINE_OFFSET = 3;
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

          return {
            type: line.startsWith('WARNING') ? 'warning' : 'error',
            line: adjustedLine,
            message: match[2],
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

    if (shaderMaterial?.uniforms.iResolution) {
      shaderMaterial.uniforms.iResolution.value.set(
        renderer.domElement.width,
        renderer.domElement.height
      );
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
      shaderMaterial.uniforms.time.value = clock.getElapsedTime();
      shaderMaterial.uniforms.cameraPosition.value.copy(camera.position);
      shaderMaterial.uniforms.cameraDirection.value.copy(
        camera.getWorldDirection(new THREE.Vector3())
      );
      shaderMaterial.uniforms.cameraFov.value = camera.fov * (Math.PI / 180);
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

    createShaderMaterial();

    if (task.type === '3D' && task.modelPath) loadGLTFModel();
    else createMesh(new THREE.PlaneGeometry(2, 2));

    lastTaskTitle = task.title;
  }

  function createShaderMaterial() {
    if (!container || !camera || isDestroyed) return;

    shaderMaterial = new THREE.RawShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        time: { value: 0 },
        iResolution: {
          value: new THREE.Vector2(
            container.clientWidth * window.devicePixelRatio,
            container.clientHeight * window.devicePixelRatio
          )
        },
        cameraFov: { value: camera.fov * (Math.PI / 180) },
        cameraPosition: { value: camera.position.clone() },
        cameraDirection: { value: camera.getWorldDirection(new THREE.Vector3()) }
      },
      glslVersion: THREE.GLSL3
    });
  }

  function loadGLTFModel() {
    const loader = new GLTFLoader();
    loader.load(
      `${base}/${task.modelPath}`,
      (gltf) => {
        if (isDestroyed) return;

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
    if (vertexShader === lastVertexShader && fragmentShader === lastFragmentShader) return;

    lastVertexShader = vertexShader;
    lastFragmentShader = fragmentShader;

    // Clear old errors before recompilation
    taskStore.clearShaderErrors();

    shaderMaterial.vertexShader = vertexShader;
    shaderMaterial.fragmentShader = fragmentShader;
    shaderMaterial.needsUpdate = true;
  }

  /* ---------------------------- Cleanup ---------------------------- */
  function cleanup() {
    isDestroyed = true;
    if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);

    resizeObserver?.disconnect();
    controls?.dispose();

    if (mesh) {
      mesh.geometry.dispose();
      mesh = null;
    }

    shaderMaterial?.dispose();
    shaderMaterial = null;

    if (renderer) {
      renderer.dispose();
      if (renderer.domElement && container?.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer = null;
    }

    scene = null;
    camera = null;
  }

  /* ---------------------------- Reactive Updates ---------------------------- */
  $: if (shaderMaterial && !isDestroyed) {
    updateShaders();
  }

  $: if (task && scene && lastTaskTitle && task.title !== lastTaskTitle) {
    loadMeshForTask();
  }

  /* ---------------------------- Lifecycle ---------------------------- */
  onMount(() => {
    initRenderer();
  });

  onDestroy(() => {
    cleanup();
  });
</script>

<div
  bind:this={container}
  class="absolute inset-0 w-full h-full bg-background rounded-xl overflow-hidden"
></div>
