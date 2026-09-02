---
title: Projection
category: Projection
task: Lambert
shader stages:
  - vertex
scene:
  objects:
    - source: models/ProjectionEdges.glb
---

# Vertex Shader

```glsl
// @prefix
precision highp float;

in vec3 position;
in vec2 uv;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

out vec3 vLocalPosition;
out vec2 vEdgeUv;
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
    vLocalPosition = position;
    vEdgeUv = uv;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(frustumPosition.xyz, 1.0);
}
```

# Fragment Shader

```glsl
precision highp float;

in vec2 vEdgeUv;

out vec4 fragColor;

void main() {
    vec2 distanceToEdge = min(vEdgeUv, 1.0 - vEdgeUv);
    vec2 edgeWidth = fwidth(vEdgeUv) * 3.5;
    vec2 edge = vec2(1.0) - step(edgeWidth, distanceToEdge);
    float line = max(edge.x, edge.y);
    if (line == 0.0) discard;
    fragColor = vec4(vec3(0.75, 0.12, 0.18), 1.0);
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
