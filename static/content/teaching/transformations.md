---
title: Transformations
category: Transformations
shaderStages:
  - vertex
scenes:
  - objects:
      - source: models/TransformShape.glb
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

// @control label="Pivot P" pivot=true pivotOffset=uPivotOffset default="0,0,0" step=0.1
uniform vec3 uPivotPoint;
// @control hidden=true default="0,0,0"
uniform vec3 uPivotOffset;
// @control label="Translation T" transform=translate readonly=true default="1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1"
uniform mat4 uTranslationMatrix;
// @control label="Rotation R" transform=rotate readonly=true default="1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1"
uniform mat4 uRotationMatrix;
// @control label="Scale S" transform=scale readonly=true default="1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1"
uniform mat4 uScaleMatrix;

void main() {
    mat4 pivotMatrix = mat4(1.0);
    pivotMatrix[3].xyz = uPivotPoint;
    mat4 meshOffsetMatrix = mat4(1.0);
    meshOffsetMatrix[3].xyz = uPivotOffset;
    // @readback visualize=point target=uPivotPoint inverse=uTranslationMatrix
    vec3 pivotWorld = (uTranslationMatrix * vec4(uPivotPoint, 1.0)).xyz;
    // @readback label="Local transform (T · R · S)"
    mat4 localMatrix = uTranslationMatrix * uRotationMatrix * uScaleMatrix;
    mat4 pointMatrix = uTranslationMatrix * pivotMatrix * uRotationMatrix * uScaleMatrix * meshOffsetMatrix;
    vec4 transformedPosition = pointMatrix * vec4(position, 1.0);
    vTransformedPosition = transformedPosition.xyz;
    vTransformedNormal = mat3(transpose(inverse(pointMatrix))) * normal;

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

void main() {
    vec3 normal = normalize(vTransformedNormal);
    vec3 lightDirection = normalize(vec3(1.0, 0.5, 1.0));
    vec3 viewDirection = normalize(cameraPosition - vTransformedPosition);
    float diffuseFactor = max(dot(normal, lightDirection), 0.0);
    vec3 reflectionDirection = 2.0 * dot(normal, lightDirection) * normal - lightDirection;
    float specularFactor = pow(max(dot(reflectionDirection, viewDirection), 0.0), 32.0);

    vec3 baseColor = vec3(0.8, 0.4, 0.2);
    vec3 ambient = 0.05 * baseColor;
    vec3 diffuse = diffuseFactor * baseColor;
    vec3 specular = specularFactor * vec3(0.3);
    fragColor = vec4(ambient + diffuse + specular, 1.0);
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

The pivot $c$ chooses where the transform gizmo appears. Changing it leaves the mesh in place. Its world position is:

$$
c_{world} = T\begin{pmatrix}c_x\\c_y\\c_z\\1\end{pmatrix}.
$$

Points are transformed from right to left:

$$
p' = Mp, \qquad M = TPRS O.
$$

Here $P$ places the pivot and $O$ places the mesh relative to it. The mesh offset stays coupled to the pivot: $O=P^{-1}$.

In vertex coordinates, this is $p' = t + c + RS(p + o)$. When choosing the pivot before rotating or scaling, $o=-c$, so it becomes:

$$
p' = t + c + RS(p-c).
$$

Subtract the pivot, rotate and scale, then add the pivot back. If the pivot is moved after transforming, the translation is compensated to preserve the current mesh position. The pivot therefore moves in world space and subsequent rotations and scales use the new center.

The displayed local transform is $TRS$. Rotating changes only $R$, scaling changes only $S$, and translating changes only $T$. Moving the pivot updates $T$ to compensate for the new pivot frame.

Normals are directions, so translation does not affect them. Their linear transformation is $A=RS$.

Non-uniform scaling can tilt a normal. The inverse transpose corrects this:

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
