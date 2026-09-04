---
title: Transformations
category: Transformations
shaderStages:
  - vertex
overlays:
  transformControls:
    mode: translate
scenes:
  - objects:
      - source: models/Cube.glb
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

// @control translationMatrix matrix label="Translation T" readonly=true default="1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1"
uniform mat4 uTranslationMatrix;
// @control rotationMatrix matrix label="Rotation R" readonly=true default="1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1"
uniform mat4 uRotationMatrix;
// @control scaleMatrix matrix label="Scale S" readonly=true default="1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1"
uniform mat4 uScaleMatrix;

void main() {
    // @readback pointMatrix matrix label="Point matrix (T · R · S)"
    mat4 pointMatrix = uTranslationMatrix * uRotationMatrix * uScaleMatrix;
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

Points are written in homogeneous form as `p = (x, y, z, 1)ᵀ`. Translation by `(tₓ, tᵧ, t_z)`, rotation about the z axis by angle `φ`, and scaling by `(sₓ, sᵧ, s_z)` are:

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

The shader builds `M = T · R · S` and transforms every point with `p' = M · p`. With column vectors, this means scale is applied first, then rotation, and finally translation. The displayed point matrix is exactly this product.

For normals, `M` is not sufficient under non-uniform scaling. The shader therefore uses the normal matrix `N = (M⁻¹)ᵀ` and computes `n' = N · n`.
