---
title: Projection
category: Projection
shader stages:
  - vertex
scenes:
  - objects:
      - source: models/ProjectionEdges.glb
        wireframe: true
        lineWidth: 5
---

# Vertex Shader

```glsl
// @prefix
precision highp float;

in vec3 position;
in vec3 barycentric;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

out vec3 vBarycentric;
// @prefix

// @control near slider label="Near n" min=0.1 max=2 step=0.05 default=1
uniform float uNear;
// @control far slider label="Far f" min=2.5 max=10 step=0.1 default=6
uniform float uFar;
// @control fov slider label="Field of view (°)" min=30 max=120 step=1 default=90
uniform float uFov;
// @control aspect slider label="Aspect ratio" min=0.5 max=2.5 step=0.01 default=1.333
uniform float uAspect;

void main() {
    float tanHalfFov = tan(radians(uFov) * 0.5);
    // @readback left float label="Left l"
    float left = -uNear * uAspect * tanHalfFov;
    // @readback right float label="Right r"
    float right = uNear * uAspect * tanHalfFov;
    // @readback bottom float label="Bottom b"
    float bottom = -uNear * tanHalfFov;
    // @readback top float label="Top t"
    float top = uNear * tanHalfFov;
    // @readback projectionMatrix matrix label="Projection matrix P"
    // ShaderLab rewrites row-major matrix literals before compiling, so this
    // matches the conventional matrix shown below.
    mat4 teachingProjectionMatrix = mat4(
        2.0 * uNear / (right - left), 0.0,
        (right + left) / (right - left), 0.0,
        0.0, 2.0 * uNear / (top - bottom),
        (top + bottom) / (top - bottom), 0.0,
        0.0, 0.0, -(uFar + uNear) / (uFar - uNear),
        -(2.0 * uFar * uNear) / (uFar - uNear),
        0.0, 0.0, -1.0, 0.0
    );

    vec4 frustumPosition = inverse(teachingProjectionMatrix) * vec4(position * 2.0, 1.0);
    frustumPosition /= frustumPosition.w;
    vBarycentric = barycentric;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(frustumPosition.xyz, 1.0);
}
```

# Fragment Shader

```glsl
precision highp float;

in vec3 vBarycentric;

uniform float uWireframeLineWidth;

out vec4 fragColor;

void main() {
    // Every quad is two triangles. The loader assigns barycentric values to
    // their vertices and offsets the coordinate opposite the longest edge.
    // The shared diagonal is the longest edge, so it never reaches zero and
    // cannot be drawn as a wireframe line.
    // Convert each barycentric coordinate to its perpendicular distance from
    // an edge in framebuffer pixels. Unlike fwidth(), the Euclidean gradient
    // is not wider for diagonal lines, so every orientation gets the same
    // apparent stroke width.
    vec3 gradientX = dFdx(vBarycentric);
    vec3 gradientY = dFdy(vBarycentric);
    vec3 gradient = sqrt(gradientX * gradientX + gradientY * gradientY);
    vec3 edgeDistance = vBarycentric / max(gradient, vec3(1e-6));
    float nearestEdge = min(edgeDistance.x, min(edgeDistance.y, edgeDistance.z));
    float coverage = 1.0 - smoothstep(
        uWireframeLineWidth - 0.75,
        uWireframeLineWidth + 0.75,
        nearestEdge
    );
    if (coverage == 0.0) discard;

    // The renderer enables blending for this quad wireframe scene, so the
    // coverage becomes a smooth, resolution-independent antialiasing ramp.
    // A muted back-face colour keeps occluded frustum edges readable without
    // competing with the front outline.
    vec3 frontColor = vec3(0.75, 0.12, 0.18);
    vec3 backColor = vec3(0.34, 0.06, 0.10);
    fragColor = vec4(gl_FrontFacing ? frontColor : backColor, coverage);
}
```

# Overview

Adjust the near and far planes, vertical field of view, and aspect ratio. The shader calculates the symmetric frustum limits `l`, `r`, `b`, and `t` from them, displaying each in its own readback row. The unit cube becomes the corresponding viewing frustum, while the matrix display shows the same projection matrix used by the shader.

# Explanation

`n` and `f` are positive distances. In eye space, the near and far planes therefore lie at `z = -n` and `z = -f`. For vertical field of view `α` and aspect ratio `a`, the shader calculates the symmetric near plane:

$$
t = n\tan\left(\frac{\alpha}{2}\right),\qquad b = -t,\qquad r = a\,t,\qquad l = -r
$$

With these limits, the projection matrix used in the shader is:

$$
P =
\begin{pmatrix}
\frac{2n}{r-l} & 0 & \frac{r+l}{r-l} & 0 \\
0 & \frac{2n}{t-b} & \frac{t+b}{t-b} & 0 \\
0 & 0 & -\frac{f+n}{f-n} & -\frac{2fn}{f-n} \\
0 & 0 & -1 & 0
\end{pmatrix}
$$

For a point `p_eye`, `p_clip = P · p_eye`. The last row produces `w_clip = -z_eye`. Perspective foreshortening appears only after the division `p_ndc = p_clip / p_clip.w`. For visualization, the demo reverses this process: `P⁻¹` transforms the unit cube into its corresponding frustum.
