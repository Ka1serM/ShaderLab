import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

/* ------------------ Types ------------------ */

interface ShaderError {
  line: number;
  message: string;
}

interface ShaderPreviewProps {
  vertexShader: string;
  fragmentShader: string;
  type?: "3D" | "2D";
  onError?: (errors: ShaderError[]) => void;
}

/* ------------------ GLSL Error Parser ------------------ */

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

/* ------------------ ShaderMesh ------------------ */

export const ShaderMesh = ({
  vertexShader,
  fragmentShader,
  type = "3D",
  onError,
}: ShaderPreviewProps) => {
  const meshRef = useRef<THREE.Group>(null);

  const shaderMaterial = useMemo(() => {
    try {
      const mat = new THREE.RawShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: { time: { value: 0 } },
      });
      onError?.([]); // clear previous errors
      return mat;
    } catch (err: any) {
      const errors = parseGLSLErrors(err.message || String(err));
      onError?.(errors);
      return new THREE.MeshBasicMaterial({ color: 0xff0000 }); // fallback
    }
  }, [vertexShader, fragmentShader, type, onError]);

  // Update rotation + uniform time
  useFrame((state) => {
    if (type === "3D" && meshRef.current) {
      if (shaderMaterial instanceof THREE.ShaderMaterial) {
        shaderMaterial.uniforms.time.value = state.clock.elapsedTime;
      }
      meshRef.current.rotation.y += 0.002;
    }
  });

  // Load model and clone it for isolated copies
  const { scene: originalScene } = useGLTF(`${import.meta.env.BASE_URL}models/HeadDavid.glb`);;
  const scene = useMemo(() => originalScene.clone(true), [originalScene]);

  // Apply shader material to each mesh
  useMemo(() => {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        (child as THREE.Mesh).material = shaderMaterial;
      }
    });
  }, [scene, shaderMaterial]);

  // Optional 2D plane for fragment-only shaders
  if (type === "2D") {
    const positions = new Float32Array([
      -1, -1, 0,
       1, -1, 0,
      -1,  1, 0,
      -1,  1, 0,
       1, -1, 0,
       1,  1, 0,
    ]);
    const geometry = useMemo(() => {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      return geom;
    }, []);
    return <mesh key="2d" material={shaderMaterial} geometry={geometry} />;
  }

  // 3D model
  return <primitive key="3d" ref={meshRef} object={scene} />;
};

useGLTF.preload(`${import.meta.env.BASE_URL}models/HeadDavid.glb`);

/* ------------------ ShaderPreview ------------------ */
export const ShaderPreview = ({
  vertexShader,
  fragmentShader,
  type = "3D",
  onError,
}: ShaderPreviewProps) => {
  const cameraPosition: [number, number, number] = type === "3D" ? [0, 0, 3] : [0, 0, 1];
  return (
    <div
      className="w-full h-full bg-output-bg"
      style={{ borderRadius: 16, overflow: "hidden" }}
    >
      <Canvas camera={{ position: cameraPosition, fov: 50 }}>
        <ShaderMesh
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          type={type}
          onError={onError}
        />
        {type === "3D" && <OrbitControls enableZoom enablePan enableRotate />}
      </Canvas>
    </div>
  );
};

export default ShaderPreview;