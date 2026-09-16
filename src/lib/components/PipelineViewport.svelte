<script lang="ts">
  import { onMount } from 'svelte';
  import * as THREE from 'three';
  import { createPipelineGeometry, pipelineKeyframes } from '$lib/renderer/pipeline/pipelineScene';

  export let stage = 0;
  export let space = '';

  let container: HTMLDivElement;
  let unavailable = false;
  let updateStage: ((value: number) => void) | undefined;

  $: updateStage?.(stage);

  onMount(() => {
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      unavailable = true;
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 1.3, 6.6);
    camera.lookAt(0, 0, 0);

    const red = new THREE.Color(0xbf2732);
    const pale = new THREE.Color(0xd9dce1);
    const dark = new THREE.Color(0x343840);
    // A cube makes the coordinate-space transformations legible: its local
    // axes, orientation and relation to the camera frustum stay recognisable.
    const objectGeometry = new THREE.BoxGeometry(1.45, 1.45, 1.45);
    const solidMaterial = new THREE.MeshStandardMaterial({ color: red, roughness: .38, metalness: .12, flatShading: true });
    const solid = new THREE.Mesh(objectGeometry, solidMaterial);
    const wire = new THREE.LineSegments(new THREE.EdgesGeometry(objectGeometry), new THREE.LineBasicMaterial({ color: red, transparent: true, opacity: .95 }));
    const object = new THREE.Group();
    object.add(solid, wire);
    scene.add(object);

    const axes = new THREE.AxesHelper(2.15);
    axes.visible = false;
    scene.add(axes);

    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
    keyLight.position.set(3, 4, 4);
    scene.add(keyLight, new THREE.AmbientLight(0xffffff, .3));

    const pipelineGeometry = createPipelineGeometry();
    const cameraGuide = new THREE.CameraHelper(pipelineGeometry.pipelineCamera);
    cameraGuide.setColors(pale, pale, pale, red, pale);
    scene.add(cameraGuide);
    const cameraSpaceAxes = new THREE.AxesHelper(2.2);
    const viewSpaceCamera = new THREE.PerspectiveCamera(
      pipelineGeometry.pipelineCamera.fov,
      pipelineGeometry.pipelineCamera.aspect,
      pipelineGeometry.pipelineCamera.near,
      pipelineGeometry.pipelineCamera.far
    );
    viewSpaceCamera.lookAt(0, 0, -1);
    viewSpaceCamera.updateMatrixWorld(true);
    viewSpaceCamera.updateProjectionMatrix();
    const viewCameraGuide = new THREE.CameraHelper(viewSpaceCamera);
    viewCameraGuide.setColors(pale, pale, pale, red, pale);
    const viewDirection = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 1.15, 0xbf2732, .18, .1);
    const viewGrid = new THREE.GridHelper(8, 16, 0x555961, 0x30333a);
    const viewCubeMaterial = new THREE.MeshStandardMaterial({ color: red, roughness: .38, metalness: .12, flatShading: true, transparent: true });
    const viewCube = new THREE.Mesh(pipelineGeometry.viewGeometry, viewCubeMaterial);
    scene.add(cameraSpaceAxes, viewCameraGuide, viewDirection, viewGrid, viewCube);

    // NDC is the real canonical cube. The mesh inside has been transformed by
    // model, view and projection matrices, divided by w, then clipped against
    // all six planes of this cube.
    const ndcGroup = new THREE.Group();
    const ndcBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 2, 2)), new THREE.LineBasicMaterial({ color: pale, transparent: true, opacity: .8 }));
    const ndcMaterial = new THREE.MeshBasicMaterial({ color: red, transparent: true, opacity: .72, side: THREE.DoubleSide });
    const ndcMesh = new THREE.Mesh(pipelineGeometry.ndcGeometry, ndcMaterial);
    ndcGroup.add(ndcBox, ndcMesh);
    scene.add(ndcGroup);

    const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 2.7), new THREE.MeshBasicMaterial({ color: 0x101114, transparent: true, opacity: .9, side: THREE.DoubleSide }));
    screen.position.z = -.65;
    scene.add(screen);
    const screenBorder = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(3.8, 2.7)), new THREE.LineBasicMaterial({ color: pale }));
    screenBorder.position.z = -.63;
    scene.add(screenBorder);
    const viewportMaterial = new THREE.MeshBasicMaterial({ color: red, transparent: true, opacity: .72, side: THREE.FrontSide, depthTest: true, depthWrite: true });
    const viewportMesh = new THREE.Mesh(pipelineGeometry.screenGeometry, viewportMaterial);
    viewportMesh.position.z = -.58;
    scene.add(viewportMesh);

    const rasterizedCube = new THREE.Points(pipelineGeometry.rasterGeometry, new THREE.PointsMaterial({ color: red, size: .06, sizeAttenuation: false, depthTest: true, depthWrite: true }));
    rasterizedCube.position.z = -.55;
    scene.add(rasterizedCube);

    const grid = new THREE.GridHelper(7, 14, 0x555961, 0x30333a);
    grid.position.y = -1.6;
    scene.add(grid);

    // One persistent scene; the individual modules describe its keyframe states.
    // This lets the pipeline morph between stages instead of replacing a canvas.
    const targetPosition = new THREE.Vector3();
    const targetRotation = new THREE.Euler();
    const targetColor = new THREE.Color();
    const targetScaleVector = new THREE.Vector3(1, 1, 1);
    const targetViewerPosition = new THREE.Vector3(0, 1.3, 6.6);
    let targetScale = 1;
    let isInitialized = false;

    updateStage = (value) => {
      const state = pipelineKeyframes[value]!;
      object.visible = state.object && value !== 3 && value !== 5 && value !== 6 && value !== 7;
      solid.visible = state.solid;
      wire.visible = state.wire;
      axes.visible = state.axes;
      keyLight.visible = state.light;
      cameraGuide.visible = state.camera;
      cameraSpaceAxes.visible = value === 3;
      viewCameraGuide.visible = value === 3;
      viewDirection.visible = value === 3;
      viewGrid.visible = value === 3;
      viewCube.visible = value === 3;
      ndcGroup.visible = value === 5;
      screen.visible = state.screen;
      screenBorder.visible = state.screen;
      rasterizedCube.visible = state.raster;
      viewportMesh.visible = value === 6 || value === 8 || value === 9;
      grid.visible = state.grid;
      targetPosition.set(...state.position);
      targetRotation.set(...state.rotation);
      targetScale = state.scale;
      targetScaleVector.setScalar(targetScale);
      targetColor.set(state.color);
      targetViewerPosition.set(...state.viewerPosition);

      if (!isInitialized) {
        object.position.copy(targetPosition);
        object.rotation.copy(targetRotation);
        object.scale.setScalar(targetScale);
        solid.material.color.copy(targetColor);
        camera.position.copy(targetViewerPosition);
        isInitialized = true;
      }
    };
    updateStage(stage);

    const resize = () => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    let frame = 0;
    const render = () => {
      // Damped interpolation produces an animation that remains smooth even
      // when students switch rapidly between non-adjacent pipeline stages.
      const morph = .075;
      object.position.lerp(targetPosition, morph);
      object.scale.lerp(targetScaleVector, morph);
      object.rotation.x += (targetRotation.x - object.rotation.x) * morph;
      object.rotation.y += (targetRotation.y - object.rotation.y) * morph;
      object.rotation.z += (targetRotation.z - object.rotation.z) * morph;
      solid.material.color.lerp(targetColor, morph);
      camera.position.lerp(targetViewerPosition, morph);
      camera.lookAt(0, 0, -.7);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      objectGeometry.dispose();
      solid.material.dispose();
      wire.geometry.dispose();
      (wire.material as THREE.Material).dispose();
      cameraGuide.dispose();
      cameraSpaceAxes.geometry.dispose();
      (cameraSpaceAxes.material as THREE.Material).dispose();
      viewCameraGuide.dispose();
      viewDirection.dispose();
      viewGrid.geometry.dispose();
      (viewGrid.material as THREE.Material).dispose();
      pipelineGeometry.viewGeometry.dispose();
      (viewCube.material as THREE.Material).dispose();
      ndcBox.geometry.dispose();
      (ndcBox.material as THREE.Material).dispose();
      pipelineGeometry.ndcGeometry.dispose();
      (ndcMesh.material as THREE.Material).dispose();
      screen.geometry.dispose();
      (screen.material as THREE.Material).dispose();
      screenBorder.geometry.dispose();
      (screenBorder.material as THREE.Material).dispose();
      pipelineGeometry.screenGeometry.dispose();
      (viewportMesh.material as THREE.Material).dispose();
      pipelineGeometry.rasterGeometry.dispose();
      (rasterizedCube.material as THREE.Material).dispose();
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  });
</script>

<div class="pipeline-viewport" bind:this={container} aria-label="Three.js-Visualisierung der aktuell gewählten Pipeline-Stufe">
  {#if space}<span class="space-badge">{space}</span>{/if}
  {#if unavailable}<span class="webgl-fallback">WebGL ist nicht verfügbar.</span>{/if}
</div>

<style>
  .pipeline-viewport { position: relative; width: 100%; height: 100%; min-height: 0; overflow: hidden; border: 1px solid var(--app-line); border-radius: .6rem; background: var(--viewport-background); }
  .pipeline-viewport :global(canvas) { display: block; width: 100%; height: 100%; }
  .space-badge { position: absolute; z-index: 1; top: .75rem; left: .75rem; border: 1px solid color-mix(in srgb, var(--app-line) 80%, transparent); border-radius: 999px; background: color-mix(in srgb, var(--background) 84%, transparent); padding: .35rem .55rem; color: var(--muted-foreground); font-family: ui-monospace, monospace; font-size: .65rem; backdrop-filter: blur(8px); }
  .webgl-fallback { display: grid; min-height: inherit; place-items: center; color: var(--muted-foreground); font-size: .85rem; }
  @media (max-width: 42rem) { .pipeline-viewport { min-height: 18rem; } }
</style>
