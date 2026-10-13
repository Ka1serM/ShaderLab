export type ShaderReadbackType = 'float' | 'vector3' | 'vector4' | 'matrix4';
export type ShaderReadbackValue = number | number[];
export type ShaderReadbackRequest = { id: string; variable: string; type: ShaderReadbackType };

const GLSL_TYPES: Record<ShaderReadbackType, string> = {
	float: 'float',
	vector3: 'vec3',
	vector4: 'vec4',
	matrix4: 'mat4'
};

const COMPONENTS: Record<ShaderReadbackType, number> = {
	float: 1,
	vector3: 3,
	vector4: 4,
	matrix4: 16
};

function statementEnd(source: string, variable: string) {
	const declaration = new RegExp(`\\bmat4\\s+${variable.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`).exec(source);
	if (!declaration) return -1;
	let parentheses = 0;
	for (let index = declaration.index + declaration[0].length; index < source.length; index += 1) {
		if (source[index] === '(') parentheses += 1;
		else if (source[index] === ')') parentheses -= 1;
		else if (source[index] === ';' && parentheses === 0) return index + 1;
	}
	return -1;
}

function nonMatrixStatementEnd(source: string, variable: string, type: Exclude<ShaderReadbackType, 'matrix4'>) {
	const declaration = new RegExp(`\\b${GLSL_TYPES[type]}\\s+${variable}\\b`).exec(source);
	if (!declaration) return -1;
	let parentheses = 0;
	for (let index = declaration.index + declaration[0].length; index < source.length; index += 1) {
		if (source[index] === '(') parentheses += 1;
		else if (source[index] === ')') parentheses -= 1;
		else if (source[index] === ';' && parentheses === 0) return index + 1;
	}
	return -1;
}

function instrument(source: string, requests: ShaderReadbackRequest[]) {
	const main = source.search(/\bvoid\s+main\s*\(/);
	if (main < 0) return undefined;
	const targets = requests.map((request, requestIndex) => ({
		request,
		requestIndex,
		end: request.type === 'matrix4'
			? statementEnd(source, request.variable)
			: nonMatrixStatementEnd(source, request.variable, request.type)
	}));
	if (targets.some(target => target.end < 0)) return undefined;

	const declarations = targets.flatMap(({ request, requestIndex }) =>
		request.type === 'matrix4'
			? [0, 1, 2, 3].map(column => `out vec4 shaderlabReadback_${requestIndex}_${column};`)
			: [`out ${GLSL_TYPES[request.type]} shaderlabReadback_${requestIndex};`]
	).join('\n');
	let result = `${source.slice(0, main)}${declarations}\n${source.slice(main)}`;
	const declarationOffset = declarations.length + 1;
	for (const target of [...targets].sort((a, b) => b.end - a.end)) {
		const end = target.end + (target.end > main ? declarationOffset : 0);
		const assignment = target.request.type === 'matrix4'
			? [0, 1, 2, 3]
				.map(column => `shaderlabReadback_${target.requestIndex}_${column} = ${target.request.variable}[${column}];`)
				.join('\n')
			: `shaderlabReadback_${target.requestIndex} = ${target.request.variable};`;
		result = `${result.slice(0, end)}\n${assignment}${result.slice(end)}`;
	}
	return result;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
	const shader = gl.createShader(type)!;
	gl.shaderSource(shader, `#version 300 es\n${source}`);
	gl.compileShader(shader);
	if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
	const log = gl.getShaderInfoLog(shader);
	gl.deleteShader(shader);
	throw new Error(`Shader readback compilation failed: ${log}`);
}

function uploadUniform(gl: WebGL2RenderingContext, uniform: ReadbackUniform, values: Record<string, number | number[] | boolean>) {
	const { location, type, name } = uniform;
	const supplied = values[name];
	const array = Array.isArray(supplied) ? supplied : undefined;
	const matrix = (size: number, identity: number[]) =>
		array?.length === size && array.every(Number.isFinite) ? array : identity;
	switch (type) {
		case gl.FLOAT: gl.uniform1f(location, typeof supplied === 'number' ? supplied : 0); break;
		case gl.INT:
		case gl.BOOL: gl.uniform1i(location, typeof supplied === 'boolean' ? Number(supplied) : typeof supplied === 'number' ? supplied : 0); break;
		case gl.FLOAT_VEC2: gl.uniform2fv(location, array ?? [0, 0]); break;
		case gl.FLOAT_VEC3: gl.uniform3fv(location, array ?? [0, 0, 0]); break;
		case gl.FLOAT_VEC4: gl.uniform4fv(location, array ?? [0, 0, 0, 0]); break;
		case gl.FLOAT_MAT3: gl.uniformMatrix3fv(location, false, matrix(9, [1, 0, 0, 0, 1, 0, 0, 0, 1])); break;
		case gl.FLOAT_MAT4: gl.uniformMatrix4fv(location, false, matrix(16, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])); break;
	}
}

type ReadbackUniform = { name: string; type: number; location: WebGLUniformLocation };

/** GPU objects for one instrumented vertex shader. They are reused until the shader or the requests change. */
class ReadbackProgram {
	readonly uniforms: ReadbackUniform[] = [];
	readonly raw: Float32Array;
	readonly program: WebGLProgram;
	readonly buffer: WebGLBuffer;
	readonly feedback: WebGLTransformFeedback;
	readonly vao: WebGLVertexArrayObject;

	constructor(private readonly gl: WebGL2RenderingContext, vertexSource: string, requests: ShaderReadbackRequest[]) {
		const instrumented = instrument(vertexSource, requests);
		if (!instrumented) throw new Error(`Shader readback variables ${requests.map(request => request.variable).join(', ')} were not found in the vertex shader.`);
		this.program = this.link(instrumented, requests);
		this.buffer = gl.createBuffer()!;
		this.feedback = gl.createTransformFeedback()!;
		this.vao = gl.createVertexArray()!;
		this.raw = new Float32Array(requests.reduce((total, request) => total + COMPONENTS[request.type], 0));
		gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, this.buffer);
		// Not a *_READ usage: Chrome allocates a shadow copy for READ buffers at every fence, but WebGL's
		// getBufferSubData never consumes it, so each rewrite logs a "discarded the shadow copy" warning.
		gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, this.raw.byteLength, gl.DYNAMIC_COPY);
		gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, null);
		const uniformCount = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS) as number;
		for (let index = 0; index < uniformCount; index += 1) {
			const info = gl.getActiveUniform(this.program, index);
			if (!info) continue;
			const name = info.name.replace(/\[0\]$/, '');
			const location = gl.getUniformLocation(this.program, name);
			if (location) this.uniforms.push({ name, type: info.type, location });
		}
	}

	dispose() {
		this.gl.deleteTransformFeedback(this.feedback);
		this.gl.deleteBuffer(this.buffer);
		this.gl.deleteVertexArray(this.vao);
		this.gl.deleteProgram(this.program);
	}

	private link(instrumented: string, requests: ShaderReadbackRequest[]) {
		const gl = this.gl;
		const vertex = compile(gl, gl.VERTEX_SHADER, instrumented);
		let fragment: WebGLShader;
		try {
			fragment = compile(gl, gl.FRAGMENT_SHADER, 'precision highp float; out vec4 color; void main() { color = vec4(0.0); }');
		} catch (error) {
			gl.deleteShader(vertex);
			throw error;
		}
		const program = gl.createProgram()!;
		gl.attachShader(program, vertex);
		gl.attachShader(program, fragment);
		const varyings = requests.flatMap((request, requestIndex) =>
			request.type === 'matrix4'
				? [0, 1, 2, 3].map(column => `shaderlabReadback_${requestIndex}_${column}`)
				: [`shaderlabReadback_${requestIndex}`]
		);
		gl.transformFeedbackVaryings(program, varyings, gl.INTERLEAVED_ATTRIBS);
		gl.linkProgram(program);
		gl.deleteShader(vertex);
		gl.deleteShader(fragment);
		if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
		const log = gl.getProgramInfoLog(program);
		gl.deleteProgram(program);
		throw new Error(`Shader readback linking failed: ${log}`);
	}
}

type ReadbackInput = {
	vertexSource: string;
	requests: ShaderReadbackRequest[];
	uniformValues: Record<string, number | number[] | boolean>;
};

type PendingReadback = { input: ReadbackInput; program: ReadbackProgram; fence: WebGLSync };

/**
 * Executes one vertex and captures explicitly marked local values from the GPU.
 * Reads are asynchronous: a fence marks the transform feedback result, so reading it never stalls the GPU.
 * At most one read is in flight; requests made meanwhile collapse into the latest one.
 */
export class ShaderReadback {
	private program?: ReadbackProgram;
	// Identity of the source and request list that `program` was built for. A failed build stays cached as undefined.
	private programSource?: string;
	private programRequests?: ShaderReadbackRequest[];
	private pending?: PendingReadback;
	private queued?: ReadbackInput;

	constructor(
		private readonly gl: WebGL2RenderingContext,
		private readonly onValues: (values: Record<string, ShaderReadbackValue>) => void
	) {}

	get busy() {
		return this.pending !== undefined;
	}

	request(vertexSource: string, requests: ShaderReadbackRequest[], uniformValues: Record<string, number | number[] | boolean>) {
		const input = { vertexSource, requests, uniformValues };
		if (this.pending) {
			this.queued = input;
			return;
		}
		this.issue(input);
	}

	/** Delivers a finished read and starts the queued one. Returns whether a read is still in flight. */
	collect() {
		const pending = this.pending;
		if (!pending) return false;
		const gl = this.gl;
		if (gl.isContextLost()) {
			this.pending = undefined;
			this.queued = undefined;
			return false;
		}
		if (gl.getSyncParameter(pending.fence, gl.SYNC_STATUS) !== gl.SIGNALED) return true;
		gl.deleteSync(pending.fence);
		this.pending = undefined;
		gl.bindBuffer(gl.COPY_READ_BUFFER, pending.program.buffer);
		gl.getBufferSubData(gl.COPY_READ_BUFFER, 0, pending.program.raw);
		gl.bindBuffer(gl.COPY_READ_BUFFER, null);
		const queued = this.queued;
		this.queued = undefined;
		// A result for a replaced shader or request list is outdated; only the queued read is relevant.
		if (!queued || (queued.vertexSource === pending.input.vertexSource && queued.requests === pending.input.requests)) {
			this.onValues(decode(pending.input.requests, pending.program.raw));
		}
		if (queued) this.issue(queued);
		return this.pending !== undefined;
	}

	dispose() {
		if (this.pending) this.gl.deleteSync(this.pending.fence);
		this.pending = undefined;
		this.queued = undefined;
		this.program?.dispose();
		this.program = undefined;
		this.programSource = undefined;
		this.programRequests = undefined;
	}

	private issue(input: ReadbackInput) {
		const gl = this.gl;
		if (!input.requests.length || gl.isContextLost()) return;
		const program = this.programFor(input.vertexSource, input.requests);
		if (!program) return;
		try {
			gl.useProgram(program.program);
			for (const uniform of program.uniforms) uploadUniform(gl, uniform, input.uniformValues);
			gl.bindVertexArray(program.vao);
			gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, program.feedback);
			gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, program.buffer);
			gl.enable(gl.RASTERIZER_DISCARD);
			gl.beginTransformFeedback(gl.POINTS);
			gl.drawArrays(gl.POINTS, 0, 1);
			gl.endTransformFeedback();
		} finally {
			gl.disable(gl.RASTERIZER_DISCARD);
			gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
			gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
			gl.bindVertexArray(null);
			gl.useProgram(null);
		}
		const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)!;
		gl.flush();
		this.pending = { input, program, fence };
	}

	private programFor(vertexSource: string, requests: ShaderReadbackRequest[]) {
		if (vertexSource === this.programSource && requests === this.programRequests) return this.program;
		this.program?.dispose();
		this.program = undefined;
		this.programSource = vertexSource;
		this.programRequests = requests;
		try {
			this.program = new ReadbackProgram(this.gl, vertexSource, requests);
		} catch (error) {
			console.warn(error);
		}
		return this.program;
	}
}

function decode(requests: ShaderReadbackRequest[], raw: Float32Array) {
	const values: Record<string, ShaderReadbackValue> = {};
	let offset = 0;
	for (const request of requests) {
		const size = COMPONENTS[request.type];
		values[request.id] = request.type === 'float' ? raw[offset] : Array.from(raw.subarray(offset, offset + size));
		offset += size;
	}
	return values;
}
