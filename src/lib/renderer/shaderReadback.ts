export type ShaderReadbackRequest = { id: string; variable: string };

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

function instrument(source: string, requests: ShaderReadbackRequest[]) {
	const main = source.search(/\bvoid\s+main\s*\(/);
	if (main < 0) return undefined;
	const targets = requests.map((request, requestIndex) => ({
		request,
		requestIndex,
		end: statementEnd(source, request.variable)
	}));
	if (targets.some(target => target.end < 0)) return undefined;

	const declarations = targets.flatMap(({ requestIndex }) =>
		[0, 1, 2, 3].map(column => `out vec4 shaderlabReadback_${requestIndex}_${column};`)
	).join('\n');
	let result = `${source.slice(0, main)}${declarations}\n${source.slice(main)}`;
	const declarationOffset = declarations.length + 1;
	for (const target of [...targets].sort((a, b) => b.end - a.end)) {
		const end = target.end + (target.end > main ? declarationOffset : 0);
		const assignment = [0, 1, 2, 3]
			.map(column => `shaderlabReadback_${target.requestIndex}_${column} = ${target.request.variable}[${column}];`)
			.join('\n');
		result = `${result.slice(0, end)}\n${assignment}${result.slice(end)}`;
	}
	return result;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
	const shader = gl.createShader(type);
	if (!shader) return undefined;
	gl.shaderSource(shader, `#version 300 es\n${source}`);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		console.warn('Shader readback compilation failed:', gl.getShaderInfoLog(shader));
		gl.deleteShader(shader);
		return undefined;
	}
	return shader;
}

function uploadUniform(gl: WebGL2RenderingContext, program: WebGLProgram, info: WebGLActiveInfo, values: Record<string, number | number[] | boolean>) {
	const name = info.name.replace(/\[0\]$/, '');
	const location = gl.getUniformLocation(program, name);
	if (!location) return;
	const supplied = values[name];
	const array = Array.isArray(supplied) ? supplied : undefined;
	switch (info.type) {
		case gl.FLOAT: gl.uniform1f(location, typeof supplied === 'number' ? supplied : 0); break;
		case gl.INT:
		case gl.BOOL: gl.uniform1i(location, typeof supplied === 'boolean' ? Number(supplied) : typeof supplied === 'number' ? supplied : 0); break;
		case gl.FLOAT_VEC2: gl.uniform2fv(location, array ?? [0, 0]); break;
		case gl.FLOAT_VEC3: gl.uniform3fv(location, array ?? [0, 0, 0]); break;
		case gl.FLOAT_VEC4: gl.uniform4fv(location, array ?? [0, 0, 0, 0]); break;
		case gl.FLOAT_MAT3: gl.uniformMatrix3fv(location, false, array ?? [1, 0, 0, 0, 1, 0, 0, 0, 1]); break;
		case gl.FLOAT_MAT4: gl.uniformMatrix4fv(location, false, array ?? [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]); break;
	}
}

/** Executes one vertex and captures explicitly marked mat4 values from the GPU. */
export function readShaderMatrices(
	gl: WebGL2RenderingContext,
	vertexSource: string,
	requests: ShaderReadbackRequest[],
	uniformValues: Record<string, number | number[] | boolean>
) {
	if (!requests.length) return {};
	const instrumented = instrument(vertexSource, requests);
	if (!instrumented) return {};
	const vertex = compile(gl, gl.VERTEX_SHADER, instrumented);
	const fragment = compile(gl, gl.FRAGMENT_SHADER, 'precision highp float; out vec4 color; void main() { color = vec4(0.0); }');
	if (!vertex || !fragment) {
		if (vertex) gl.deleteShader(vertex);
		if (fragment) gl.deleteShader(fragment);
		return {};
	}

	const program = gl.createProgram();
	if (!program) return {};
	gl.attachShader(program, vertex);
	gl.attachShader(program, fragment);
	const varyings = requests.flatMap((_, requestIndex) =>
		[0, 1, 2, 3].map(column => `shaderlabReadback_${requestIndex}_${column}`)
	);
	gl.transformFeedbackVaryings(program, varyings, gl.INTERLEAVED_ATTRIBS);
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		console.warn('Shader readback linking failed:', gl.getProgramInfoLog(program));
		gl.deleteProgram(program);
		gl.deleteShader(vertex);
		gl.deleteShader(fragment);
		return {};
	}

	const buffer = gl.createBuffer();
	const feedback = gl.createTransformFeedback();
	const vao = gl.createVertexArray();
	const raw = new Float32Array(requests.length * 16);
	try {
		gl.useProgram(program);
		for (let index = 0; index < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); index += 1) {
			const info = gl.getActiveUniform(program, index);
			if (info) uploadUniform(gl, program, info, uniformValues);
		}
		gl.bindVertexArray(vao);
		gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, buffer);
		gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, raw.byteLength, gl.STREAM_READ);
		gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, feedback);
		gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, buffer);
		gl.enable(gl.RASTERIZER_DISCARD);
		gl.beginTransformFeedback(gl.POINTS);
		gl.drawArrays(gl.POINTS, 0, 1);
		gl.endTransformFeedback();
		gl.disable(gl.RASTERIZER_DISCARD);
		gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, raw);
	} finally {
		if (gl.isEnabled(gl.RASTERIZER_DISCARD)) gl.disable(gl.RASTERIZER_DISCARD);
		gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
		gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, null);
		gl.bindVertexArray(null);
		gl.useProgram(null);
		gl.deleteTransformFeedback(feedback);
		gl.deleteBuffer(buffer);
		gl.deleteVertexArray(vao);
		gl.deleteProgram(program);
		gl.deleteShader(vertex);
		gl.deleteShader(fragment);
	}
	return Object.fromEntries(requests.map((request, index) => [request.id, Array.from(raw.slice(index * 16, index * 16 + 16))]));
}
