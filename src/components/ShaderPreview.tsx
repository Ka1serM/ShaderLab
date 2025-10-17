import { useRef, useEffect, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

export const SyncedOrbitControls = ({ cameraRef, sharedTarget, }: { cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>; sharedTarget: THREE.Vector3; }) => { const controlsRef = useRef<any>(); useFrame(() => { if (!controlsRef.current || !cameraRef.current) return; cameraRef.current.position.copy(controlsRef.current.object.position); cameraRef.current.quaternion.copy(controlsRef.current.object.quaternion); controlsRef.current.target.copy(sharedTarget); }); useEffect(() => { if (!controlsRef.current) return; const callback = () => sharedTarget.copy(controlsRef.current.target); controlsRef.current.addEventListener("change", callback); return () => controlsRef.current.removeEventListener("change", callback); }, [sharedTarget]); return <OrbitControls ref={controlsRef} camera={cameraRef.current!} enableZoom enablePan enableRotate />; };

interface ShaderError {
  line: number;
  message: string;
}

interface ShaderPreviewProps {
  vertexShader: string;
  fragmentShader: string;
  modelPath?: string;
  sharedCameraRef?: React.MutableRefObject<THREE.PerspectiveCamera | null>;
  onError?: (errors: ShaderError[]) => void;
}

function parseGLSLErrors(message: string): ShaderError[] {
  const lines: ShaderError[] = [];
  const regex = /ERROR:\s*\d+:(\d+):\s*(.*)/g;
  let match;
  while ((match = regex.exec(message))) {
    const line = parseInt(match[1], 10) - 1;
    lines.push({ line, message: match[2] });
  }
  return lines;
}

/* 3D Shader Renderer - REFACTORED */
const Shader3D = ({
  vertexShader,
  fragmentShader,
  modelPath,
  onError,
  sharedCameraRef,
}: Omit<ShaderPreviewProps, never>) => {
  const meshRef = useRef<THREE.Group>(null);

  // Create the material only ONCE and keep a stable reference to it.
  const shaderMaterial = useMemo(() => {
    try {
      const mat = new THREE.RawShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: { time: { value: 0 } },
      });
      onError?.([]); // Clear errors on successful initial creation
      return mat;
    } catch (err: any) {
      onError?.(parseGLSLErrors(err.message || String(err)));
      // Return a fallback material if initial creation fails
      return new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
    }
  }, []); // <-- Empty dependency array ensures this runs only once on mount.

  // Use useEffect to UPDATE the existing material when shader props change.
  useEffect(() => {
    if (shaderMaterial instanceof THREE.RawShaderMaterial) {
      shaderMaterial.vertexShader = vertexShader;
      shaderMaterial.fragmentShader = fragmentShader;
      // Tell Three.js to recompile the shader
      shaderMaterial.needsUpdate = true;
      onError?.([]); // Clear any previous errors on a successful update
    }
  }, [vertexShader, fragmentShader, shaderMaterial, onError]);

  const { scene: originalScene } = useGLTF(modelPath as string);

  // Clone and apply the material to the scene only ONCE when the model loads.
  const scene = useMemo(() => {
    const cloned = originalScene.clone(true);
    cloned.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        // Dispose of the original materials that came with the model
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(m => m.dispose());
        } else if (mesh.material) {
          mesh.material.dispose();
        }
        // Apply our shader material
        mesh.material = shaderMaterial;
      }
    });
    return cloned;
  }, [originalScene, shaderMaterial]); // Depends on the stable material instance

  // Cleanup material only on component unmount
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

export const ShaderPreview = ({
  vertexShader,
  fragmentShader,
  modelPath,
  sharedCameraRef,
  onError,
}: ShaderPreviewProps) => {
  const target = useMemo(() => new THREE.Vector3(0, 0, 0), []);
  const localCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const cameraRef = sharedCameraRef ?? localCameraRef;
  const finalModelPath = `${import.meta.env.BASE_URL}${modelPath}`

  return (
    <div className="absolute inset-0 w-full h-full bg-background rounded-xl overflow-hidden">
      <Canvas
        key={finalModelPath} //force full remount when model changes
        camera={{ position: [0, 0, 3], fov: 50 }}
      >
        <Shader3D
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          modelPath={finalModelPath}
          sharedCameraRef={cameraRef}
          onError={onError}
        />
        <SyncedOrbitControls cameraRef={cameraRef} sharedTarget={target} />
      </Canvas>
    </div>
  );
};