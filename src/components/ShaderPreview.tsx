import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

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

// Utility: parse GLSL error string into line numbers + messages
function parseGLSLErrors(message: string): ShaderError[] {
  // Example error: "ERROR: 0:5: 'gl_Position' : undeclared identifier"
  const lines: ShaderError[] = [];
  const regex = /ERROR:\s*\d+:(\d+):\s*(.*)/g;
  let match;
  while ((match = regex.exec(message))) {
    const line = parseInt(match[1], 10) - 1; // convert to 0-based
    lines.push({ line, message: match[2] });
  }
  return lines;
}

const ShaderMesh = ({
  vertexShader,
  fragmentShader,
  type,
  onError,
}: ShaderPreviewProps) => {
  const meshRef = useRef<THREE.Mesh>(null);

  const shaderMaterial = useMemo(() => {
    try {
      const mat = new THREE.RawShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: { time: { value: 0 } },
        depthTest: type === "3D",
        depthWrite: type === "3D",
      });
      onError?.([]); // clear previous errors
      return mat;
    } catch (err: any) {
      const errors = parseGLSLErrors(err.message || String(err));
      onError?.(errors);
      return new THREE.MeshBasicMaterial({ color: 0xff0000 }); // fallback material
    }
  }, [vertexShader, fragmentShader, type, onError]);

  useFrame((state) => {
    if (type === "3D" && meshRef.current && shaderMaterial instanceof THREE.ShaderMaterial) {
      shaderMaterial.uniforms.time.value = state.clock.elapsedTime;
      meshRef.current.rotation.y += 0.005;
    }
  });

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

  return (
    <mesh key="3d" ref={meshRef} material={shaderMaterial}>
      <sphereGeometry args={[1, 64, 64]} />
    </mesh>
  );
};

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
