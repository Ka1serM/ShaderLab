export type ShaderDiagnostic = {
  type: 'error' | 'warning';
  line: number;
  message: string;
  timestamp?: number;
};

export type ShaderDiagnostics = {
  vertex: ShaderDiagnostic[];
  fragment: ShaderDiagnostic[];
};

const VERSION = '#version 300 es\n';

function sourceForWebGL(source: string) {
  return source.trimStart().startsWith('#version')
    ? { source, addedLines: 0 }
    : { source: VERSION + source, addedLines: 1 };
}

function parseLog(log: string, addedLines: number, hiddenLines: number): ShaderDiagnostic[] {
  return log.split(/\r?\n/).map<ShaderDiagnostic | null>(rawLine => {
    const match = rawLine.trim().match(/^(?:(ERROR|WARNING)\s*:\s*)?(?:\d+\s*:\s*)?(\d+)(?:\s*\(\s*\d+\s*\))?\s*:\s*(.*)$/i);
    if (!match) return null;
    return {
      type: match[1]?.toLowerCase() === 'warning' ? 'warning' as const : 'error' as const,
      line: Math.max(1, Number(match[2]) - addedLines - hiddenLines),
      message: match[3].trim(),
      timestamp: Date.now()
    };
  }).filter((error): error is ShaderDiagnostic => error !== null);
}

/** Compile and link candidates without installing them into Three.js. */
export function validateShaderProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
  hiddenLines: { vertex: number; fragment: number }
): { valid: boolean; diagnostics: ShaderDiagnostics } {
  const vertex = sourceForWebGL(vertexSource);
  const fragment = sourceForWebGL(fragmentSource);
  const diagnostics: ShaderDiagnostics = { vertex: [], fragment: [] };

  const compile = (type: number, candidate: typeof vertex, stage: keyof ShaderDiagnostics) => {
    const shader = gl.createShader(type);
    if (!shader) {
      diagnostics[stage].push({ type: 'error', line: 1, message: `Could not create ${stage} shader.` });
      return null;
    }
    gl.shaderSource(shader, candidate.source);
    gl.compileShader(shader);
    diagnostics[stage] = parseLog(gl.getShaderInfoLog(shader) ?? '', candidate.addedLines, hiddenLines[stage]);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      if (!diagnostics[stage].length) diagnostics[stage].push({ type: 'error', line: 1, message: `${stage} shader compilation failed.` });
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };

  const vertexShader = compile(gl.VERTEX_SHADER, vertex, 'vertex');
  const fragmentShader = compile(gl.FRAGMENT_SHADER, fragment, 'fragment');
  if (!vertexShader || !fragmentShader) {
    if (vertexShader) gl.deleteShader(vertexShader);
    if (fragmentShader) gl.deleteShader(fragmentShader);
    return { valid: false, diagnostics };
  }

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    diagnostics.fragment.push({ type: 'error', line: 1, message: 'Could not create shader program.' });
    return { valid: false, diagnostics };
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  const linked = Boolean(gl.getProgramParameter(program, gl.LINK_STATUS));
  const linkLog = (gl.getProgramInfoLog(program) ?? '').trim();
  if (!linked) diagnostics.fragment.push({ type: 'error', line: 1, message: linkLog || 'Shader program linking failed.', timestamp: Date.now() });

  gl.deleteProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  return { valid: linked, diagnostics };
}
