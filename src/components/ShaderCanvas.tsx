import { useRef, useMemo, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { Lesson } from "@/contexts/LessonContext";

export const SyncedOrbitControls = ({
  cameraRef,
  sharedTarget,
}: {
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>;
  sharedTarget: React.MutableRefObject<THREE.Vector3>;
}) => {
  const controlsRef = useRef<OrbitControls>(null);

  // sync each frame
  useFrame(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    // copy target from shared
    controls.target.copy(sharedTarget.current);

    // copy camera position/quaternion from shared camera
    camera.position.copy(camera.position);
    camera.quaternion.copy(camera.quaternion);

    controls.update();
  });

  // update shared target when user manipulates controls
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const onChange = () => sharedTarget.current.copy(controls.target);
    controls.addEventListener("change", onChange);
    return () => controls.removeEventListener("change", onChange);
  }, [sharedTarget]);

  return (
    <OrbitControls
      ref={controlsRef}
      camera={cameraRef.current!}
      enableZoom
      enablePan
      enableRotate
    />
  );
};

interface ShaderCanvasProps {
  lesson: Lesson;
  vertexShader: string;
  fragmentShader: string;
  sharedCameraRef?: React.MutableRefObject<THREE.PerspectiveCamera | null>;
  sharedTargetRef?: React.MutableRefObject<THREE.Vector3>;
}

export const ShaderCanvas = ({
  lesson,
  vertexShader,
  fragmentShader,
  sharedCameraRef,
  sharedTargetRef,
}: ShaderCanvasProps) => {
  const { type, modelPath, instanceCount = 1 } = lesson;
  const cameraRef = sharedCameraRef ?? useRef<THREE.PerspectiveCamera | null>(null);
  const targetRef = sharedTargetRef ?? useRef(new THREE.Vector3(0, 0, 0));

  const Shader = () => {
    const meshRef = useRef<THREE.InstancedMesh | null>(null);
    const { gl } = useThree();

    const shaderMaterial = useMemo(() => {
      const mat = new THREE.RawShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          time: { value: 0 },
          iResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        },
        glslVersion: THREE.GLSL3
      });
      return mat;
    }, [vertexShader, fragmentShader, gl, type]);

    useEffect(() => {
      if (!meshRef.current) return;

      const tempObject = new THREE.Object3D();
      const gridSize = Math.ceil(Math.cbrt(instanceCount));
      const spacing = type === "3D" ? 2.5 : 0;

      for (let i = 0; i < instanceCount; i++) {
        if (instanceCount > 1) {
          const x = (i % gridSize) - gridSize / 2;
          const y = (Math.floor(i / gridSize) % gridSize) - gridSize / 2;
          const z = Math.floor(i / (gridSize * gridSize)) - gridSize / 2;
          tempObject.position.set(x * spacing, y * spacing, z * spacing);
        } else {
          tempObject.position.set(0, 0, 0);
        }
        tempObject.updateMatrix();
        meshRef.current.setMatrixAt(i, tempObject.matrix);
      }
      meshRef.current.instanceMatrix.needsUpdate = true;
    }, [instanceCount, type]);

    useEffect(() => {
      shaderMaterial.vertexShader = vertexShader;
      shaderMaterial.fragmentShader = fragmentShader;
      shaderMaterial.needsUpdate = true;
    }, [vertexShader, fragmentShader, shaderMaterial]);

    useEffect(() => {
      const onResize = () => {
        shaderMaterial.uniforms.iResolution.value.set(window.innerWidth, window.innerHeight);
      };
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }, [shaderMaterial]);

    useFrame((state) => {
      shaderMaterial.uniforms.time.value = state.clock.elapsedTime;

      if (cameraRef.current) {
        state.camera.position.copy(cameraRef.current.position);
        state.camera.quaternion.copy(cameraRef.current.quaternion);
      } else {
        cameraRef.current = state.camera as THREE.PerspectiveCamera;
      }

      if (meshRef.current && type === "3D" && instanceCount === 1) {
        meshRef.current.rotation.y += 0.001;
      }
    });

    const geometry = useMemo(() => {
      if (type === "3D" && modelPath) {
        const { scene } = useGLTF(`${import.meta.env.BASE_URL}${modelPath}`);
        let geo: THREE.BufferGeometry | null = null;
        scene.traverse((child) => {
          if ((child as THREE.Mesh).isMesh && !geo) {
            geo = (child as THREE.Mesh).geometry;
          }
        });
        return geo || new THREE.BoxGeometry(1, 1, 1);
      } else {
        return new THREE.PlaneGeometry(2, 2);
      }
    }, [type, modelPath]);

    return <instancedMesh ref={meshRef} args={[geometry, shaderMaterial, instanceCount]} />;
  };

  return (
    <div className="absolute inset-0 w-full h-full bg-background rounded-xl overflow-hidden">
      <Canvas key={fragmentShader} camera={{ position: [0, 0, 3], fov: 50 }}>
        <Shader />
        <SyncedOrbitControls cameraRef={cameraRef} sharedTarget={targetRef} />
      </Canvas>
    </div>
  );
};