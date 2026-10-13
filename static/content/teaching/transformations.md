---
title: Transformations
category: Transformations
shaderStages:
  - vertex
scenes:
  - label: David
    objects:
      - source: models/HeadDavid.glb
  - label: Teapot
    objects:
      - source: models/Teapot.glb
  - label: Sphere
    objects:
      - source: models/Sphere.glb
---

# Vertex Shader

```glsl
// @prefix
precision highp float;

in vec3 position;
in vec3 normal;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

out vec3 vTransformedPosition;
out vec3 vTransformedNormal;
// @prefix

// @control label="Inverse transpose normals" default=true
uniform bool uInverseTransposeNormals;

const vec3 CENTER_PIVOT = vec3(0.0, 0.0, 0.0);
const vec3 LEFT_PIVOT = vec3(-2.0, 0.0, 0.0);

// @control label="Pivot" options="Center,Left" default=0
uniform int uPivot;

// @control label="Translation T" transform=translate pivot=pivotPoint readonly=true default="1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1"
uniform mat4 uTranslationMatrix;

// @control label="Rotation R" transform=rotate readonly=true default="1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1"
uniform mat4 uRotationMatrix;

// @control label="Scale S" transform=scale readonly=true default="1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1"
uniform mat4 uScaleMatrix;

void main() {
    // @readback hidden=true
    vec3 pivotPoint = uPivot == 0 ? CENTER_PIVOT : LEFT_PIVOT;

    mat4 pivotMatrix = mat4(1.0);
    pivotMatrix[3].xyz = pivotPoint;

    mat4 inversePivotMatrix = mat4(1.0);
    inversePivotMatrix[3].xyz = -pivotPoint;

    // @readback visualize=point
    vec3 pivotWorld = (uTranslationMatrix * vec4(pivotPoint, 1.0)).xyz;

    // @readback label="Local transform (T · R · S)"
    mat4 localMatrix = uTranslationMatrix * uRotationMatrix * uScaleMatrix;

    mat4 pointMatrix = uTranslationMatrix
                     * pivotMatrix
                     * uRotationMatrix
                     * uScaleMatrix
                     * inversePivotMatrix;

    vec4 transformedPosition = pointMatrix * vec4(position, 1.0);
    vTransformedPosition = transformedPosition.xyz;

    mat3 normalMatrix = mat3(pointMatrix);
    if (uInverseTransposeNormals) {
        normalMatrix = transpose(inverse(normalMatrix));
    }
    vTransformedNormal = normalMatrix * normal;

    gl_Position = projectionMatrix * modelViewMatrix * transformedPosition;
}
```

# Fragment Shader

```glsl
precision highp float;

in vec3 vTransformedPosition;
in vec3 vTransformedNormal;

uniform vec3 cameraPosition;

out vec4 fragColor;

const int LIGHT_COUNT = 3;

const vec3 LIGHT_DIRECTIONS[LIGHT_COUNT] = vec3[](
    vec3( 0.6, 0.8,  0.7),
    vec3(-0.8, 0.2,  0.5),
    vec3(-0.3, 0.5, -1.0)
);

const vec3 LIGHT_COLORS[LIGHT_COUNT] = vec3[](
    vec3(1.0, 0.88, 0.74),
    vec3(0.3, 0.4,  0.6),
    vec3(0.7, 0.8,  1.0)
);

void main() {
    vec3 normal = normalize(vTransformedNormal);
    vec3 viewDirection = normalize(cameraPosition - vTransformedPosition);
    vec3 baseColor = vec3(0.82, 0.78, 0.72);

    vec3 groundAmbient = vec3(0.04, 0.035, 0.03);
    vec3 skyAmbient = vec3(0.1, 0.12, 0.16);
    vec3 color = mix(groundAmbient, skyAmbient, 0.5 + 0.5 * normal.y) * baseColor;

    for (int i = 0; i < LIGHT_COUNT; i++) {
        vec3 lightDirection = normalize(LIGHT_DIRECTIONS[i]);
        vec3 halfwayDirection = normalize(lightDirection + viewDirection);

        float diffuseFactor = max(dot(normal, lightDirection), 0.0);
        float specularFactor = 0.0;
        if (diffuseFactor > 0.0) {
            specularFactor = pow(max(dot(normal, halfwayDirection), 0.0), 48.0);
        }

        color += LIGHT_COLORS[i] * (diffuseFactor * baseColor + 0.25 * specularFactor);
    }

    fragColor = vec4(pow(color, vec3(1.0 / 2.2)), 1.0);
}
```

# Overview

Adjust translation, rotation, and scale, and observe their combined effect on the object.

# Explanation

For a homogeneous point $p=(x,y,z,1)^T$:

$$
T =
\begin{pmatrix}
1&0&0&t_x\\
0&1&0&t_y\\
0&0&1&t_z\\
0&0&0&1
\end{pmatrix}
$$

$$
R_z =
\begin{pmatrix}
\cos\varphi&-\sin\varphi&0&0\\
\sin\varphi&\cos\varphi&0&0\\
0&0&1&0\\
0&0&0&1
\end{pmatrix}
$$

$$
S =
\begin{pmatrix}
s_x&0&0&0\\
0&s_y&0&0\\
0&0&s_z&0\\
0&0&0&1
\end{pmatrix}
$$

The pivot $c$ is the center for rotation and scaling, and the transform gizmo appears there. Two fixed pivots are available: the center $(0,0,0)$ and a point on the left $(-2,0,0)$. Select the active pivot with "Pivot"; the red point in the viewport shows it. Its world position is:

$$
c_{world} = T\begin{pmatrix}c_x\\c_y\\c_z\\1\end{pmatrix}.
$$

Points are transformed from right to left:

$$
p' = Mp, \qquad M = TPRSP^{-1}.
$$

$P^{-1}$ moves the pivot to the origin, $RS$ rotates and scales there, and $P$ moves it back. In vertex coordinates:

$$
p' = t + c + RS(p-c).
$$

Switching the pivot while $R$ and $S$ are identity leaves the mesh in place, because $c$ and $-c$ cancel. Once the mesh is rotated or scaled they no longer cancel: switching the pivot re-applies the same $R$ and $S$ around the new center, so the mesh moves by $(I-RS)\Delta c$.

The displayed local transform is $TRS$. Rotating changes only $R$, scaling changes only $S$, and translating changes only $T$.

Normals are directions, so translation does not affect them. Their linear transformation is $A=RS$.

Non-uniform scaling can tilt a normal. Turn off "Inverse transpose normals" and scale the object non-uniformly to see the wrong lighting. The inverse transpose corrects this:

$$
N = (A^{-1})^T
$$

For rotation and scaling, this simplifies to:

$$
N = RS^{-1}
$$

The inverse scale uses reciprocal scale factors:

$$
S^{-1} =
\begin{pmatrix}
1/s_x&0&0\\
0&1/s_y&0\\
0&0&1/s_z
\end{pmatrix}
$$

Finally, transform and normalize the normal:

$$
n' = \operatorname{normalize}(Nn)
$$

The inverse exists only when $s_x$, $s_y$, and $s_z$ are nonzero.
