<script>
  import { onMount, onDestroy } from "svelte";
  import * as THREE from "three";
  import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
  import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
  import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";

  let container;
  let renderer, scene, camera, controls, resizeObserver, animationFrameId;
  let textMesh, gridMesh;

  onMount(() => {
    // --- Scene ---
    scene = new THREE.Scene();

    // --- Camera ---
    const aspect = container.clientWidth / container.clientHeight;
    camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 100);
    camera.position.set(-0.3, 0.15, 1.25);

    // --- Renderer ---
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;';
    container.appendChild(renderer.domElement);

    // --- Controls ---
	controls = new OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.dampingFactor = 0.05;
	controls.autoRotate = true;
	controls.autoRotateSpeed = 0.1;
	controls.maxDistance = 5;
	controls.minDistance = 0.5;

    // --- Load font and create 3D text ---
    const loader = new FontLoader();
    loader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', font => {
      const geometry = new TextGeometry('ShaderLab', {
        font,
        size: 0.2,
        height: 1,
		    depth: 0.1,
        curveSegments: 24,
        bevelEnabled: true,
        bevelThickness: 0.01,
        bevelSize: 0.01
      });
      geometry.center();

      textMesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xfa5320, metalness: 0, roughness: 0.01 }));
      scene.add(textMesh);
    });

    // --- Grid with radial fade shader ---
	const gridShader = {
	uniforms: {
		uTime: { value: 0 }
	},
	vertexShader: `
		varying vec2 vUv;
		void main() {
		vUv = uv;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
	`,
	fragmentShader: `
		uniform float uTime;
		varying vec2 vUv;

		float gridLineAA(float coord, float spacing, float thickness) {
		float line = abs(fract(coord / spacing - 0.5) - 0.5);
		float fw = fwidth(coord / spacing);          // screen-space derivative
		return 1.0 - smoothstep(0.0, thickness + fw, line);
		}

		void main() {
		vec2 uv = vUv;

		// Thicker, anti-aliased grid lines
		float lineX = gridLineAA(uv.x, 0.1, 0.02);
		float lineY = gridLineAA(uv.y, 0.1, 0.02);
		float grid = max(lineX, lineY);

		// Radial fade from center
		vec2 center = uv - 0.5;
		float dist = length(center) * 2.0;
		float mask = 1.0 - smoothstep(0.5, 1.0, dist);

		gl_FragColor = vec4(vec3(grid), grid * mask);
		}
	`,
	transparent: true
	};

    const planeGeo = new THREE.PlaneGeometry(5, 5, 1, 1);
	const planeMat = new THREE.ShaderMaterial({
	...gridShader,
	side: THREE.DoubleSide
	});
    gridMesh = new THREE.Mesh(planeGeo, planeMat);
    gridMesh.rotation.x = -Math.PI / 2;
    gridMesh.position.y = -0.15;
    scene.add(gridMesh);

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 3);
    dirLight.position.set(1, 1, 1);
    scene.add(dirLight);

    // --- Resize Observer ---
	resizeObserver = new ResizeObserver(() => {
	if (!renderer || !camera) return;

	const width = container.clientWidth;
	const height = container.clientHeight;

	// Update camera
	camera.aspect = width / height;
	camera.updateProjectionMatrix();

	// Update renderer size and pixel ratio
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize(width, height, false); // false prevents clearing

	// Render immediately to avoid black flash
	renderer.render(scene, camera);
	});
    resizeObserver.observe(container);

    // --- Animation Loop ---
    const animate = (time) => {
      animationFrameId = requestAnimationFrame(animate);
      controls?.update();
      if (gridMesh) gridMesh.material.uniforms.uTime.value = time * 0.001;
      renderer.render(scene, camera);
    };
    animate();
  });

  onDestroy(() => {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    resizeObserver?.disconnect();
    controls?.dispose();
    if (textMesh) { scene.remove(textMesh); textMesh.geometry.dispose(); textMesh = null; }
    if (gridMesh) { scene.remove(gridMesh); gridMesh.geometry.dispose(); gridMesh.material.dispose(); gridMesh = null; }
    renderer?.dispose();
    if (renderer?.domElement && container?.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    scene = null; camera = null;
  });
</script>

<style>
  .canvas-container {
    width: 100%;
    height: 100%;
    position: absolute;
    inset: 0;
    overflow: hidden;
  }
</style>

<div bind:this={container} class="canvas-container"></div>
