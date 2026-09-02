<script lang="ts">
  import { onMount } from 'svelte';
  import * as THREE from 'three';

  let container: HTMLDivElement;
  let failed = false;

  onMount(() => {
    let renderer: THREE.WebGLRenderer;

    try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      failed = true;
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0.15, 4.2);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.setAttribute('aria-label', 'Echtzeit-Particle-Viewport');
    container.appendChild(renderer.domElement);

    const count = 7200;
    const positions = new Float32Array(count * 3);
    const scales = new Float32Array(count);

    for (let index = 0; index < count; index += 1) {
      const radius = 1.05 + Math.random() * 0.42;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const offset = index * 3;
      positions[offset] = radius * Math.sin(phi) * Math.cos(theta);
      positions[offset + 1] = radius * Math.cos(phi);
      positions[offset + 2] = radius * Math.sin(phi) * Math.sin(theta);
      scales[index] = 0.35 + Math.random() * 0.85;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
			side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uPointer: { value: new THREE.Vector2() },
        uAspect: { value: 1 },
        uPointerActive: { value: 0 },
        uLightMode: { value: document.documentElement.classList.contains('dark') ? 0 : 1 }
      },
      vertexShader: `
        uniform float uTime;
        uniform vec2 uPointer;
        uniform float uAspect;
        uniform float uPointerActive;
        attribute float aScale;
        varying float vVisibility;
        varying vec3 vViewNormal;

        vec3 fieldPotential(vec3 p) {
          return vec3(
            sin(p.y * 2.2 + uTime * 0.25) + cos(p.z * 1.7 - uTime * 0.4),
            sin(p.z * 2.0 - uTime * 0.3) + cos(p.x * 1.9 + uTime * 0.2),
            sin(p.x * 2.5 + uTime * 0.35) + cos(p.y * 2.3 - uTime * 0.25)
          );
        }

        vec3 curlField(vec3 p) {
          float e = 0.07;
          vec3 px0 = fieldPotential(p - vec3(e, 0.0, 0.0));
          vec3 px1 = fieldPotential(p + vec3(e, 0.0, 0.0));
          vec3 py0 = fieldPotential(p - vec3(0.0, e, 0.0));
          vec3 py1 = fieldPotential(p + vec3(0.0, e, 0.0));
          vec3 pz0 = fieldPotential(p - vec3(0.0, 0.0, e));
          vec3 pz1 = fieldPotential(p + vec3(0.0, 0.0, e));

          return normalize(vec3(
            (py1.z - py0.z - pz1.y + pz0.y) / (2.0 * e),
            (pz1.x - pz0.x - px1.z + px0.z) / (2.0 * e),
            (px1.y - px0.y - py1.x + py0.x) / (2.0 * e)
          ));
        }

        void main() {
          vec3 sphereNormal = normalize(position);
          vec3 primaryFlow = curlField(position * 1.25 + uTime * 0.07);
          vec3 secondaryFlow = curlField(position * 2.4 - uTime * 0.11);
          vec3 displaced = position + primaryFlow * 0.17 + secondaryFlow * 0.075;

          float shellWave = sin(position.x * 4.2 + position.z * 2.7 + uTime * 1.35);
          shellWave += sin(position.y * 6.0 - position.x * 2.0 - uTime * 1.1) * 0.55;
          displaced += sphereNormal * shellWave * 0.065;

          vec4 baseMvPosition = modelViewMatrix * vec4(position, 1.0);
          vec4 baseClipPosition = projectionMatrix * baseMvPosition;
          vec2 particleNdc = baseClipPosition.xy / baseClipPosition.w;
          vec2 cursorDelta = particleNdc - uPointer;
          cursorDelta.x *= uAspect;
          float cursorDistance = length(cursorDelta);
          float cursorInfluence = 1.0 - smoothstep(0.0, 0.42, cursorDistance);

          vec3 baseViewNormal = normalize(normalMatrix * sphereNormal);
          float frontFacing = smoothstep(-0.15, 0.55, dot(-normalize(baseMvPosition.xyz), baseViewNormal));
          cursorInfluence *= frontFacing * uPointerActive;

          vec2 swirlDirection = normalize(vec2(-cursorDelta.y, cursorDelta.x) + vec2(0.0001));
          vec3 swirlView = vec3(
            swirlDirection.x / projectionMatrix[0][0],
            swirlDirection.y / projectionMatrix[1][1],
            0.0
          );
          mat3 modelViewRotation = mat3(modelViewMatrix);
          vec3 swirlLocal = normalize(vec3(
            dot(modelViewRotation[0], swirlView),
            dot(modelViewRotation[1], swirlView),
            dot(modelViewRotation[2], swirlView)
          ));
          displaced += (primaryFlow * 0.65 + swirlLocal * 0.85) * cursorInfluence * 0.24;
          displaced += sphereNormal * sin(uTime * 2.4 + position.y * 8.0) * cursorInfluence * 0.08;

          vViewNormal = baseViewNormal;
          vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);

          float visibility = step(-0.1, dot(-normalize(mvPosition.xyz), baseViewNormal));
          vVisibility = visibility;

          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = (1.2 + aScale * 2.2) * (8.0 / max(1.0, -mvPosition.z));
          gl_PointSize += (1.0 - visibility) * 0.8;
        }
      `,
      fragmentShader: `
        varying float vVisibility;
        varying vec3 vViewNormal;
        uniform float uLightMode;

        void main() {
          vec2 centered = gl_PointCoord * 2.0 - 1.0;
          float distanceToCenter = length(centered);
          if (distanceToCenter > 0.9) discard;

          float alpha = 1.0 - smoothstep(0.72, 0.9, distanceToCenter);
          vec3 normalColor = normalize(vViewNormal) * 0.5 + 0.5;
          vec3 red = mix(vec3(0.52, 0.035, 0.055), vec3(0.78, 0.09, 0.12), uLightMode);
          vec3 neutral = mix(vec3(0.12, 0.13, 0.16), vec3(0.48, 0.50, 0.55), uLightMode);
          vec3 color = mix(neutral, red, 0.15 + vVisibility * 0.55);
          color += normalColor * 0.018;

          float lightModeAlpha = mix(1.0, 0.72, uLightMode);
          gl_FragColor = vec4(color, alpha * (0.35 + vVisibility * 0.65) * lightModeAlpha);
        }
      `
    });

    const themeObserver = new MutationObserver(() => {
      material.uniforms.uLightMode.value = document.documentElement.classList.contains('dark') ? 0 : 1;
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    const orbitGroup = new THREE.Group();
    const orbitMaterial = new THREE.MeshBasicMaterial({
      color: 0xbf2732,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
			side: THREE.DoubleSide
    });
    const orbitSecondaryMaterial = new THREE.MeshBasicMaterial({
      color: 0xaeb3bb,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
			side: THREE.DoubleSide
    });
    const orbitGeometry = new THREE.TorusGeometry(1.55, 0.009, 6, 180);
    const secondaryOrbitGeometry = new THREE.TorusGeometry(1.72, 0.006, 6, 180);
    const orbit = new THREE.Mesh(orbitGeometry, orbitMaterial);
    const secondaryOrbit = new THREE.Mesh(secondaryOrbitGeometry, orbitSecondaryMaterial);
    orbit.rotation.x = Math.PI * 0.58;
    orbit.rotation.y = Math.PI * 0.12;
    secondaryOrbit.rotation.x = Math.PI * 0.34;
    secondaryOrbit.rotation.z = Math.PI * 0.18;
    orbitGroup.add(orbit, secondaryOrbit);
    scene.add(orbitGroup);

    const satelliteGeometry = new THREE.SphereGeometry(0.045, 10, 8);
    const satelliteMaterial = new THREE.MeshBasicMaterial({ color: 0xe8e9eb, side: THREE.DoubleSide });
    const satellite = new THREE.Mesh(satelliteGeometry, satelliteMaterial);
    satellite.position.set(1.55, 0, 0);
    orbitGroup.add(satellite);

    const starPositions = new Float32Array(180 * 3);
    for (let index = 0; index < 180; index += 1) {
      const radius = 2.4 + Math.random() * 1.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const offset = index * 3;
      starPositions[offset] = radius * Math.sin(phi) * Math.cos(theta);
      starPositions[offset + 1] = radius * Math.cos(phi);
      starPositions[offset + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMaterial = new THREE.PointsMaterial({
      color: 0xb7bbc1,
      size: 0.025,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);

    const clock = new THREE.Clock();
    let frame = 0;
    const pointer = new THREE.Vector2();
    const pointerTarget = new THREE.Vector2();

    function resize() {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      material.uniforms.uAspect.value = width / height;
      renderer.setSize(width, height, false);
    }

    function handlePointerMove(event: PointerEvent) {
      const bounds = container.getBoundingClientRect();
      pointerTarget.x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
      pointerTarget.y = -((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
      material.uniforms.uPointerActive.value = 1;
    }

    function handlePointerLeave() {
      material.uniforms.uPointerActive.value = 0;
    }

    function animate() {
      const time = clock.getElapsedTime();
      pointer.lerp(pointerTarget, 0.08);
      material.uniforms.uTime.value = time;
      material.uniforms.uPointer.value.copy(pointer);
      particles.rotation.y += 0.0018;
      particles.rotation.x += (pointer.y * 0.08 - particles.rotation.x) * 0.025;
      particles.rotation.z += (pointer.x * 0.08 - particles.rotation.z) * 0.025;
      orbitGroup.rotation.y += 0.003;
      orbitGroup.rotation.z -= 0.0012;
      stars.rotation.y -= 0.00025;
      stars.rotation.x += 0.00012;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('pointerleave', handlePointerLeave);
    resize();
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      themeObserver.disconnect();
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerleave', handlePointerLeave);
      geometry.dispose();
      material.dispose();
      orbitGeometry.dispose();
      secondaryOrbitGeometry.dispose();
      orbitMaterial.dispose();
      orbitSecondaryMaterial.dispose();
      satelliteGeometry.dispose();
      satelliteMaterial.dispose();
      starGeometry.dispose();
      starMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  });
</script>

<div class="home-viewport" bind:this={container} style="background: var(--viewport-background);">
  {#if failed}
    <div class="home-viewport-fallback">WebGL unavailable</div>
  {/if}
</div>

<style>
  .home-viewport {
    position: absolute;
    inset: 0;
    overflow: hidden;
    background: var(--viewport-background);
  }

  .home-viewport :global(canvas) {
    display: block;
    width: 100%;
    height: 100%;
  }

  .home-viewport-fallback {
    display: grid;
    height: 100%;
    place-items: center;
    color: var(--red, #bf2732);
    font: 700 10px/1 Inter, Arial, sans-serif;
    letter-spacing: .12em;
    text-transform: uppercase;
  }
</style>
