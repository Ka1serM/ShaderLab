import { useRef, useMemo, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useLessonContext, RawShaderError } from "@/contexts/LessonContext";

export const SyncedOrbitControls = ({
  cameraRef,
  sharedTarget,
}: {
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>;
  sharedTarget: THREE.Vector3;
}) => {
  const controlsRef = useRef<any>();
  useFrame(() => {
    if (!controlsRef.current || !cameraRef.current) return;
    cameraRef.current.position.copy(controlsRef.current.object.position);
    cameraRef.current.quaternion.copy(controlsRef.current.object.quaternion);
    controlsRef.current.target.copy(sharedTarget);
  });
  useEffect(() => {
    if (!controlsRef.current) return;
    const callback = () => sharedTarget.copy(controlsRef.current.target);
    controlsRef.current.addEventListener("change", callback);
    return () => controlsRef.current.removeEventListener("change", callback);
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

interface ShaderPreviewProps {
  vertexShader: string;
  fragmentShader: string;
  modelPath?: string;
  onError?: (errors: RawShaderError[]) => void;
  type: "2D" | "3D",
  sharedCameraRef?: React.MutableRefObject<THREE.PerspectiveCamera | null>;
}

const Shader3D = ({
  vertexShader,
  fragmentShader,
  modelPath,
  sharedCameraRef,
  onError,
}) => {
  const meshRef = useRef<THREE.Group>(null);
  const { gl } = useThree();

  const shaderMaterial = useMemo(() => {
    const mat = new THREE.RawShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { time: { value: 0 } },
      glslVersion: THREE.GLSL3
    });
    return mat;
  }, [vertexShader, fragmentShader, gl, onError]);

  useEffect(() => {
    if (shaderMaterial instanceof THREE.RawShaderMaterial) {
      shaderMaterial.vertexShader = vertexShader;
      shaderMaterial.fragmentShader = fragmentShader;
      shaderMaterial.needsUpdate = true;
    }
  }, [vertexShader, fragmentShader, shaderMaterial]);

  const { scene: originalScene } = useGLTF(modelPath as string);
  const scene = useMemo(() => {
    const cloned = originalScene.clone(true);
    cloned.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else if (mesh.material) {
          mesh.material.dispose();
        }
        mesh.material = shaderMaterial;
      }
    });
    return cloned;
  }, [originalScene, shaderMaterial]);

  useEffect(() => {
    return () => {
      shaderMaterial.dispose();
    };
  }, [shaderMaterial]);

  useFrame((state) => {
    if (sharedCameraRef?.current) {
      state.camera.position.copy(sharedCameraRef.current.position);
      state.camera.quaternion.copy(sharedCameraRef.current.quaternion);
    } else if (sharedCameraRef) {
      sharedCameraRef.current = state.camera as THREE.PerspectiveCamera;
    }
    if (meshRef.current && shaderMaterial instanceof THREE.RawShaderMaterial) {
      shaderMaterial.uniforms.time.value = state.clock.elapsedTime;
      meshRef.current.rotation.y += 0.001;
    }
  });

  return <primitive ref={meshRef} object={scene} />;
};

const Shader2D = ({
  vertexShader,
  fragmentShader,
}: Pick<ShaderPreviewProps, "vertexShader" | "fragmentShader">) => {
  const { gl } = useThree();

  const shaderMaterial = useMemo(() => {
    const mat = new THREE.RawShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { time: { value: 0 } },
      glslVersion: THREE.GLSL3,
      depthTest: false,
      depthWrite: false,
    });
    return mat;
  }, [vertexShader, fragmentShader, gl]);

  useEffect(() => {
    if (shaderMaterial instanceof THREE.RawShaderMaterial) {
      shaderMaterial.vertexShader = vertexShader;
      shaderMaterial.fragmentShader = fragmentShader;
      shaderMaterial.needsUpdate = true;
    }
  }, [vertexShader, fragmentShader, shaderMaterial]);

  useEffect(() => {
    return () => {
      shaderMaterial.dispose();
    };
  }, [shaderMaterial]);

  useFrame((state) => {
    if (shaderMaterial instanceof THREE.RawShaderMaterial) {
      shaderMaterial.uniforms.time.value = state.clock.elapsedTime;
    }
  });

  return (
    <mesh material={shaderMaterial}>
      {/* A 2x2 plane geometry spans from -1 to 1 in X and Y, covering the full Normalized Device Coordinates (NDC) space.
      */}
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
};

export const ShaderPreview = ({
  vertexShader,
  fragmentShader,
  modelPath,
  sharedCameraRef,
  onError,
  type,
}: ShaderPreviewProps) => {
  const target = useMemo(() => new THREE.Vector3(0, 0, 0), []);
  const localCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const cameraRef = sharedCameraRef ?? localCameraRef;
  const finalModelPath = `${import.meta.env.BASE_URL}${modelPath}`;


  return (
    <div className="absolute inset-0 w-full h-full bg-background rounded-xl overflow-hidden">
      <Canvas key={fragmentShader} camera={{ position: [0, 0, 3], fov: 50 }}>
        { type == "3D" ? 
        (
          <Shader3D
            vertexShader={vertexShader}
            fragmentShader={fragmentShader}
            modelPath={finalModelPath}
            sharedCameraRef={cameraRef}
            onError={onError}
          />
        ) : (
          <Shader2D 
            vertexShader={vertexShader}
            fragmentShader={fragmentShader}
          />
        )
        }
        <SyncedOrbitControls cameraRef={cameraRef} sharedTarget={target} />
      </Canvas>
    </div>
  );
};
