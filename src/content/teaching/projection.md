---
title: Projection
category: Projection
shader stages:
  - vertex
scenes:
  - label: Teapot
    frameBox: [[-4.0, -3.0, -6.0], [4.0, 3.0, 0.0]]
    insetView:
      aspectUniform: uAspect
    objects:
      - source: models/ProjectionEdges.glb
        wireframe: true
        lineWidth: 5
      - source: models/Teapot.glb
  - label: David
    frameBox: [[-4.0, -3.0, -6.0], [4.0, 3.0, 0.0]]
    insetView:
      aspectUniform: uAspect
    objects:
      - source: models/ProjectionEdges.glb
        wireframe: true
        lineWidth: 5
      - source: models/HeadDavid.glb
  - label: Sphere
    frameBox: [[-4.0, -3.0, -6.0], [4.0, 3.0, 0.0]]
    insetView:
      aspectUniform: uAspect
    objects:
      - source: models/ProjectionEdges.glb
        wireframe: true
        lineWidth: 5
      - source: models/Sphere.glb
---

# Vertex Shader

```glsl
// @prefix
precision highp float;

in vec3 position;
in vec3 normal;
in vec3 barycentric;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform bool uWireframe;
uniform bool uInsetView;

out vec3 vBarycentric;
out vec4 vDisplayPosition;
out vec4 vClipPosition;
out vec3 vNormal;

// @control label="World → NDC" min=0 max=1 step=0.01 default=0
uniform float uNdcBlend;

// @control label="Near n" min=0.01 max=10 step=0.01 default=1
uniform float uNear;

// @control label="Far f" min=1 max=100 step=0.1 default=6
uniform float uFar;

// @control label="Field of view (°)" min=30 max=120 step=1 default=45
uniform float uFov;

// @control label="Aspect ratio" min=0.5 max=2.5 step=0.01 default=1.333
uniform float uAspect;

// @control transform=translate object=0 hidden=true default="1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1"
uniform mat4 uCameraTranslation;

// @control transform=rotate object=0 hidden=true default="1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1"
uniform mat4 uCameraRotation;

// @control transform=translate object=1 hidden=true default="1,0,0,0,0,1,0,0,0,0,1,0,0,0,-3,1"
uniform mat4 uMeshTranslation;

// @control transform=rotate object=1 hidden=true default="1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1"
uniform mat4 uMeshRotation;

// @control transform=scale object=1 hidden=true default="1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1"
uniform mat4 uMeshScale;

vec3 cofactorTransform(mat3 m, vec3 n) {
    return cross(m[1], m[2]) * n.x + cross(m[2], m[0]) * n.y + cross(m[0], m[1]) * n.z;
}

void main() {
// @prefix
// This code runs in main(). The sliders set uNear, uFar, uFov (degrees)
// and uAspect. The gizmo sets uCameraTranslation and uCameraRotation.
// The rest of the shader draws the scene with cameraProjection and cameraView.

float near = uNear;
float far = max(uFar, uNear + 0.01);
float tanHalfFov = tan(radians(uFov) * 0.5);

// @readback label="Left l"
float left = -near * uAspect * tanHalfFov;
// @readback label="Right r"
float right = near * uAspect * tanHalfFov;
// @readback label="Bottom b"
float bottom = -near * tanHalfFov;
// @readback label="Top t"
float top = near * tanHalfFov;

float width  = right - left;
float height = top - bottom;
float depth  = far - near;

// @readback label="Projection matrix P"
mat4 cameraProjection = mat4(
    2.0 * near / width, 0.0,                 (right + left) / width,  0.0,
    0.0,                2.0 * near / height, (top + bottom) / height, 0.0,
    0.0,                0.0,                 -(far + near) / depth,   -2.0 * far * near / depth,
    0.0,                0.0,                 -1.0,                    0.0
);

// The view matrix V is the inverse of the camera's placement in the world.
// @readback label="View matrix V"
mat4 cameraView = inverse(uCameraTranslation * uCameraRotation);

// @suffix
    vec3 worldPosition;
    vec3 worldNormal = normal;
    if (uWireframe) {
        vec4 frustumPosition = inverse(cameraProjection) * vec4(position * 2.0, 1.0);
        worldPosition = (uCameraTranslation * uCameraRotation * (frustumPosition / frustumPosition.w)).xyz;
    } else {
        mat4 meshMatrix = uMeshTranslation * uMeshRotation * uMeshScale;
        worldPosition = (meshMatrix * vec4(position, 1.0)).xyz;
        worldNormal = cofactorTransform(mat3(meshMatrix), normal);
    }

    vec4 clipPosition = cameraProjection * cameraView * vec4(worldPosition, 1.0);

    vBarycentric = barycentric;
    vClipPosition = clipPosition;

    if (uInsetView) {
        vDisplayPosition = vec4(worldPosition, 1.0);
        vNormal = worldNormal;
        gl_Position = clipPosition;
        return;
    }

    mat4 displayMatrix = mat4(1.0) * (1.0 - uNdcBlend) + cameraProjection * cameraView * uNdcBlend;
    vec4 displayPosition = displayMatrix * vec4(worldPosition, 1.0);

    mat3 displayJacobian;
    for (int column = 0; column < 3; column++) {
        displayJacobian[column] = displayMatrix[column].xyz * displayPosition.w - displayPosition.xyz * displayMatrix[column].w;
    }

    vDisplayPosition = displayPosition;
    vNormal = cofactorTransform(displayJacobian, worldNormal);
    gl_Position = projectionMatrix * modelViewMatrix * displayPosition;
}
// @suffix
```

# Fragment Shader

```glsl
precision highp float;

in vec3 vBarycentric;
in vec4 vDisplayPosition;
in vec4 vClipPosition;
in vec3 vNormal;

uniform vec3 cameraPosition;
uniform mat4 uCameraTranslation;
uniform bool uWireframe;
uniform bool uInsetView;
uniform float uWireframeLineWidth;
uniform float uNdcBlend;

out vec4 fragColor;

void main() {
    if (uInsetView && uWireframe) discard;

    if (!uWireframe) {
        bool outsideClipVolume = any(greaterThan(abs(vClipPosition.xyz), vec3(vClipPosition.w)));
        if (uNdcBlend > 0.0 && outsideClipVolume) discard;

        vec3 displayPosition = vDisplayPosition.xyz / vDisplayPosition.w;
        vec3 viewerPosition = uInsetView ? uCameraTranslation[3].xyz : cameraPosition;
        vec3 viewDirection = normalize(viewerPosition - displayPosition);

        vec3 normal = normalize(vNormal);
        if (dot(normal, viewDirection) < 0.0) normal = -normal;

        vec3 lightDirection = normalize(vec3(1.0, 2.0, 3.0));
        vec3 reflection = reflect(-lightDirection, normal);
        float diffuse = max(dot(normal, lightDirection), 0.0);
        float specular = pow(max(dot(reflection, viewDirection), 0.0), 16.0);

        vec3 baseColor = vec3(0.85, 0.82, 0.75);
        fragColor = vec4(baseColor * (0.2 + 0.8 * diffuse) + vec3(0.3) * specular, 1.0);
        return;
    }

    vec3 gradientX = dFdx(vBarycentric);
    vec3 gradientY = dFdy(vBarycentric);
    vec3 gradient = sqrt(gradientX * gradientX + gradientY * gradientY);

    vec3 edgeDistance = vBarycentric / max(gradient, vec3(1e-6));
    float nearestEdge = min(edgeDistance.x, min(edgeDistance.y, edgeDistance.z));

    float coverage = 1.0 - smoothstep(uWireframeLineWidth - 0.75, uWireframeLineWidth + 0.75, nearestEdge);
    if (coverage == 0.0) discard;

    vec3 frontColor = vec3(0.75, 0.12, 0.18);
    vec3 backColor = vec3(0.34, 0.06, 0.10);

    fragColor = vec4(gl_FrontFacing ? frontColor : backColor, coverage);
}
```

# Overview

Adjust the near and far planes, the vertical field of view, and the aspect ratio, as with `gluPerspective`. The demo calculates the frustum limits `l`, `r`, `b`, and `t` on the near plane from these values and shows them as read-only values. Select the mesh with the buttons in the viewport. Click the frustum or the mesh and use the gizmo to move, turn, or scale it. Press `W`, `E`, or `R` to select translate, rotate, or scale. The camera cannot be scaled. The inset shows how the camera sees the mesh. Drag the corner of the inset to change its size. Move the slider `World → NDC` to apply `V`, `P`, and the perspective division to the frustum and the mesh. The frustum becomes the cube `[-1, 1]³`, and the mesh becomes distorted with it. The inset in the bottom-left corner shows the image of the camera that `P` describes. It has the aspect ratio `(r - l) / (t - b)` of the near rectangle. The unit cube becomes the corresponding viewing frustum. The matrix display shows the same projection matrix that the shader uses.

# Explanation

`n` and `f` are positive distances. In eye space, the near and far planes therefore lie at `z = -n` and `z = -f`. The limits `l`, `r`, `b`, and `t` give the rectangle of the frustum on the near plane. The general perspective projection matrix is:

$$
P =
\begin{pmatrix}
\frac{2n}{r-l} & 0 & \frac{r+l}{r-l} & 0 \\
0 & \frac{2n}{t-b} & \frac{t+b}{t-b} & 0 \\
0 & 0 & -\frac{f+n}{f-n} & -\frac{2fn}{f-n} \\
0 & 0 & -1 & 0
\end{pmatrix}
$$

For a symmetric frustum, `r + l = 0` and `t + b = 0`, so the entries in the third column are zero. A symmetric frustum follows from a vertical field of view `α` and an aspect ratio `a`, as in `gluPerspective`:

$$
t = n\tan\left(\frac{\alpha}{2}\right),\qquad b = -t,\qquad r = a\,t,\qquad l = -r
$$

For an asymmetric frustum, `P` is the symmetric matrix multiplied by a shear `H`. The shear moves the center of the near rectangle, $\left(\frac{r+l}{2}, \frac{t+b}{2}, -n\right)$, onto the z-axis:

$$
P = P_{sym} \cdot H,\qquad
H =
\begin{pmatrix}
1 & 0 & \frac{r+l}{2n} & 0 \\
0 & 1 & \frac{t+b}{2n} & 0 \\
0 & 0 & 1 & 0 \\
0 & 0 & 0 & 1
\end{pmatrix}
$$

`P_sym` has the same first two diagonal entries and the same last two rows as `P`, but zeros in the third column of the first two rows. Here, the near plane lies at `z = -n`. The lecture's shear matrix measures depth as a positive distance, so its shear entries have the opposite sign.

The camera pose is `T · R` in the world. The view matrix `V = (T · R)⁻¹` takes a world point into eye space: `p_eye = V · p_world`. For a point `p_eye`, `p_clip = P · p_eye`. The last row produces `w_clip = -z_eye`. Perspective foreshortening appears only after the division `p_ndc = p_clip / p_clip.w`. For visualization, the demo reverses this process: `P⁻¹` transforms the unit cube into its corresponding frustum. The mesh starts at `z = -3` in the world. At the end of the slider, the shader shows it at `p_ndc`. As soon as `P` applies, the shader removes the parts of the mesh outside the clip volume `-w ≤ x, y, z ≤ w`, as the GPU does before the division. This also removes the parts behind the camera, where `w < 0`. Parts of the mesh near the camera become larger, and its depth is compressed towards the far plane. NDC is left-handed: the near plane goes to `z = -1` and the far plane goes to `z = 1`.
