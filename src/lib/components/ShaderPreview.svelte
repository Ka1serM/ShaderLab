<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as THREE from 'three';
  import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
  import type { Task } from '$lib/stores/taskStore';
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
  let resizeObserver: ResizeObserver;
  let animationFrameId: number | null = null;

  // --- Initialize scene once ---
  function initRendererAndScene() {
    if (!container) return;

    // Scene & camera
    scene = new THREE.Scene();
    const aspect = container.clientWidth / container.clientHeight;
    camera = sharedCameraRef ?? new THREE.PerspectiveCamera(30, aspect, 0.1, 1000);
    camera.position.set(0, 0, 1);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (!sharedCameraRef) sharedCameraRef = camera;

    // Renderer
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    // Clock
    clock = new THREE.Clock();

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 0.5;
    controls.maxDistance = 50;
    controls.maxPolarAngle = Math.PI;
    if (sharedTargetRef)
      controls.target.copy(sharedTargetRef);
    else
      sharedTargetRef = controls.target.clone();
    controls.update();

    // Handle resizing
    resizeObserver = new ResizeObserver(() => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      if (shaderMaterial?.uniforms.iResolution) {
        shaderMaterial.uniforms.iResolution.value.set(renderer.domElement.width, renderer.domElement.height);
      }
      renderer.render(scene, camera);
    });
    resizeObserver.observe(container);

    animate();
  }

  // --- Animate loop ---
  function animate() {
    animationFrameId = requestAnimationFrame(animate);
    if (!renderer || !scene || !camera) return;

    controls?.update();
    if (shaderMaterial) shaderMaterial.uniforms.time.value = clock.getElapsedTime();

    renderer.render(scene, camera);
  }

  // --- Dispose ---
  function disposeScene() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    resizeObserver?.disconnect();

    if (controls) {
      controls.dispose();
      controls = null;
    }

    if (mesh?.geometry) mesh.geometry.dispose();
    if (shaderMaterial) shaderMaterial.dispose();
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement && container?.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    }

    mesh = null;
    shaderMaterial = null;
    renderer = null;
    scene = null;
    animationFrameId = null;
  }

  // --- Update mesh/material when task changes ---
  function updateTaskMesh() {
    if (!task) return;

    // Remove old mesh
    if (mesh) {
      scene.remove(mesh);
      mesh.geometry.dispose();
    }

    // Material
    shaderMaterial = new THREE.RawShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        time: { value: 0 },
        iResolution: {
          value: new THREE.Vector2(container.clientWidth * window.devicePixelRatio, container.clientHeight * window.devicePixelRatio)
        },
      },
      glslVersion: THREE.GLSL3,
    });

    const loader = new GLTFLoader();

    function createMesh(geometry: THREE.BufferGeometry) {
      mesh = new THREE.InstancedMesh(geometry, shaderMaterial, task.instanceCount ?? 1);
      scene.add(mesh);
    }

    // mesh loading
    if (task.type === '3D' && task.modelPath) {
        loader.load(
          `${base}/${task.modelPath}`,
          (gltf) => {
            let foundGeometry: THREE.BufferGeometry | null = null;
            gltf.scene.traverse((child) => {
              if ((child as THREE.Mesh).isMesh && !foundGeometry) {
                foundGeometry = (child as THREE.Mesh).geometry;
              }
            });
            createMesh(foundGeometry ?? new THREE.BoxGeometry(1, 1, 1));
          },
          undefined,
          () => createMesh(new THREE.BoxGeometry(1, 1, 1))
        );
      } else {
        createMesh(new THREE.PlaneGeometry(2, 2));
      }
  }

  // --- Hot update shaders ---
  $: if (shaderMaterial) {
    shaderMaterial.vertexShader = vertexShader;
    shaderMaterial.fragmentShader = fragmentShader;
    shaderMaterial.needsUpdate = true;
  }

  // --- Reactive task updates ---
  $: if (scene && task) {
    updateTaskMesh();
  }

  onMount(() => {
    initRendererAndScene();
  });

  onDestroy(() => {
    disposeScene();
  });
</script>

<div
  bind:this={container}
  class="absolute inset-0 w-full h-full bg-background rounded-xl overflow-hidden"
></div>
