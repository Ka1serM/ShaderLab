<script>
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import * as THREE from 'three';
  import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
  import { ShaderTaskMaterial } from '$lib/renderer/ShaderTaskMaterial';

  export let vertexShader;          // Svelte store
  export let fragmentShader;        // Svelte store
  export let inputs;                // Svelte store (writable([]))
  export let sharedCameraRef = null;
  export let sharedTargetRef = null;
  export let task = null;

  let container, scene, renderer, camera, controls, clock;
  let shaderMaterial, mesh, resizeObserver;
  let animationFrameId;
  let isDestroyed = false;

  const reactiveInputs = new Map();

  onMount(() => {
    if (!container || isDestroyed) return;

    scene = new THREE.Scene();

    // --- Camera ---
    const aspect = container.clientWidth / container.clientHeight;
    camera = sharedCameraRef || new THREE.PerspectiveCamera(30, aspect, 0.1, 1000);
    camera.position.set(0, 0, 1);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (!sharedCameraRef) sharedCameraRef = camera;

    // --- Renderer ---
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight, false);
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;';
    container.appendChild(renderer.domElement);

    // --- OrbitControls ---
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 0;
    controls.maxDistance = 50;
    controls.maxPolarAngle = Math.PI;
    if (sharedTargetRef) controls.target.copy(sharedTargetRef);
    else sharedTargetRef = controls.target.clone();
    controls.update();

    // --- Clock ---
    clock = new THREE.Clock();

    // --- ShaderMaterial ---
    shaderMaterial = new ShaderTaskMaterial({
      vertexStore: vertexShader,
      fragmentStore: fragmentShader,
      inputStores: inputs
    });

    // --- Subscribe to store-backed inputs ---
    const inputArray = get(inputs);
    inputArray.forEach(input => {
      if (!input.name || !input.value) return;
      const unsubscribe = input.value.subscribe(val => {
        shaderMaterial.setUniform(input.name, val);
      });
      reactiveInputs.set(input.name, unsubscribe);
    });

    // --- Load mesh/model ---
    loadMesh();

    // --- Resize observer ---
    resizeObserver = new ResizeObserver(() => {
      if (!renderer || !camera) return;

      const w = container.clientWidth;
      const h = container.clientHeight;

      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);

      const arr = get(inputs);
      const resInput = arr.find(i => i.name === 'iResolution');
      if (resInput) {
        resInput.value.set([w * window.devicePixelRatio, h * window.devicePixelRatio]);
      }
    });
    resizeObserver.observe(container);

    // --- Animation loop ---
    const animate = () => {
      if (isDestroyed) return;

      animationFrameId = requestAnimationFrame(animate);

      controls?.update();

      // pull fresh array reference (store may have changed)
      const arr = get(inputs);

      const timeInput = arr.find(i => i.name === 'time');
      if (timeInput) timeInput.value.set(clock.getElapsedTime());

      const fovInput = arr.find(i => i.name === 'cameraFov');
      if (fovInput) fovInput.value.set(camera.fov * (Math.PI / 180));

      const posInput = arr.find(i => i.name === 'cameraPosition');
      if (posInput) posInput.value.set(camera.position.toArray());

      const dirInput = arr.find(i => i.name === 'cameraDirection');
      if (dirInput) dirInput.value.set(camera.getWorldDirection(new THREE.Vector3()).toArray());

      renderer.render(scene, camera);
    };

    animate();
  });

  // ------------- Mesh Loading -----------------

  function loadMesh() {
    if (!scene) return;

    if (mesh) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh = null;
    }

    if (task?.type === '3D' && task.modelPath) {
      const loader = new GLTFLoader();
      const expectedTitle = task.title;

      loader.load(
        task.modelPath,
        gltf => {
          if (isDestroyed || expectedTitle !== task.title) return;

          let geom = null;
          gltf.scene.traverse(child => {
            if (child.isMesh && !geom) geom = child.geometry;
          });

          createMesh(geom || new THREE.BoxGeometry(1, 1, 1));
        },
        undefined,
        err => {
          console.error(err);
          createMesh(new THREE.BoxGeometry(1, 1, 1));
        }
      );
    } else {
      createMesh(new THREE.PlaneGeometry(2, 2));
    }
  }

  function createMesh(geometry) {
    if (!geometry || !scene || !shaderMaterial) return;
    const count = task?.instanceCount || 1;
    mesh = new THREE.InstancedMesh(geometry, shaderMaterial, count);
    scene.add(mesh);
  }

  // ------------- Cleanup -----------------

  onDestroy(() => {
    isDestroyed = true;

    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    resizeObserver?.disconnect();
    controls?.dispose();

    reactiveInputs.forEach(unsub => unsub());
    reactiveInputs.clear();

    if (mesh) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh = null;
    }

    shaderMaterial?.dispose();
    renderer?.dispose();

    if (renderer?.domElement && container?.contains(renderer.domElement)) {
      container.removeChild(renderer.domElement);
    }

    scene = null;
    camera = null;
  });
</script>

<div bind:this={container} class="absolute inset-0 w-full h-full bg-background rounded-xl overflow-hidden"></div>
