---
title: Shading
category: Shading
task: Phong
showTimeControl: true
scenes:
  - label: Sphere
    objects:
      - source: models/ShadingSphere.glb
        instanceCount: 3
  - label: Teapot
    objects:
      - source: models/ShadingTeapot.glb
        instanceCount: 3
  - label: David
    objects:
      - source: models/ShadingHead.glb
        instanceCount: 3
---

# Vertex Shader

```glsl
precision highp float;

in vec3 position;
in vec3 normal;
in mat4 instanceMatrix;

uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float time;

// @control ambient color label="Ambient" default="0.05,0.05,0.05"
uniform vec3 uAmbient;
// @control kd color label="Diffuse Kd" default="0.5,0.5,0.5"
uniform vec3 uKd;
// @control ks color label="Specular Ks" default="1,1,1"
uniform vec3 uKs;
// @control shininess slider label="Shininess n" min=1 max=256 step=1 default=32
uniform float uShininess;
// @control lightDir vec3 label="Light Direction" default="1,1,1" visualize=vector
uniform vec3 uLightDir;
uniform vec3 cameraPosition;

flat out int vShadingMode;
out vec3 vWorldPosition;
out vec3 vWorldNormal;
out vec3 vColor;

vec3 phongIllumination(vec3 worldPosition, vec3 worldNormal) {
    vec3 lightDir = normalize(uLightDir);
    vec3 viewDir = normalize(cameraPosition - worldPosition);
    float nDotL = dot(worldNormal, lightDir);
    float diffuseFactor = 0.0;
    if (nDotL > 0.0) {
        diffuseFactor = nDotL;
    }

    vec3 reflectDir = 2.0 * dot(worldNormal, lightDir) * worldNormal - lightDir;
    float rDotV = dot(reflectDir, viewDir);
    float specularFactor = 0.0;
    if (rDotV > 0.0) {
        specularFactor = pow(rDotV, uShininess);
    }

    vec3 diffuse = uKd * diffuseFactor;
    vec3 specular = uKs * specularFactor;
    return uAmbient + diffuse + specular;
}

mat4 rotationYMatrix(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat4(
        c, 0.0, -s, 0.0,
        0.0, 1.0, 0.0, 0.0,
        s, 0.0, c, 0.0,
        0.0, 0.0, 0.0, 1.0
    );
}

mat4 translationMatrix(vec3 translation) {
    return mat4(
        1.0, 0.0, 0.0, translation.x,
        0.0, 1.0, 0.0, translation.y,
        0.0, 0.0, 1.0, translation.z,
        0.0, 0.0, 0.0, 1.0
    );
}

void main() {
    vShadingMode = gl_InstanceID;

    mat4 shadingMatrix = translationMatrix(vec3(float(gl_InstanceID - 1) * 2.2, 0.0, 0.0));
    mat4 localRotation = rotationYMatrix(time * 0.1);
    mat4 instanceModelMatrix = modelMatrix * instanceMatrix * shadingMatrix * localRotation;
    vec4 worldPosition = instanceModelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(transpose(inverse(instanceModelMatrix))) * normal);

    vColor = phongIllumination(vWorldPosition, vWorldNormal);

    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * shadingMatrix * localRotation * vec4(position, 1.0);
}
```

# Fragment Shader

```glsl
precision highp float;

flat in int vShadingMode;
in vec3 vWorldPosition;
in vec3 vWorldNormal;
in vec3 vColor;

uniform vec3 cameraPosition;
uniform vec3 uAmbient;
uniform vec3 uKd;
uniform vec3 uKs;
uniform vec3 uLightDir;
uniform float uShininess;

out vec4 fragColor;

vec3 phongIllumination(vec3 worldPosition, vec3 worldNormal) {
    vec3 lightDir = normalize(uLightDir);
    vec3 viewDir = normalize(cameraPosition - worldPosition);
    float nDotL = dot(worldNormal, lightDir);
    float diffuseFactor = 0.0;
    if (nDotL > 0.0) {
        diffuseFactor = nDotL;
    }

    vec3 reflectDir = 2.0 * dot(worldNormal, lightDir) * worldNormal - lightDir;
    float rDotV = dot(reflectDir, viewDir);
    float specularFactor = 0.0;
    if (rDotV > 0.0) {
        specularFactor = pow(rDotV, uShininess);
    }

    vec3 diffuse = uKd * diffuseFactor;
    vec3 specular = uKs * specularFactor;
    return uAmbient + diffuse + specular;
}

vec3 faceNormal() {
    return normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
}

void main() {
    vec3 color = vColor;
    if (vShadingMode == 0) {
        color = phongIllumination(vWorldPosition, faceNormal());
    } else if (vShadingMode == 2) {
        color = phongIllumination(vWorldPosition, normalize(vWorldNormal));
    }
    fragColor = vec4(color, 1.0);
}
```

# Overview

Use the scene selector to compare the **Sphere**, **Teapot**, and **David**. From left to right, the three instances show **flat shading**, **Gouraud shading**, and **per-fragment illumination**. The material colour and light source remain the same; only the point at which illumination is calculated changes. Adjust the light direction and shininess, paying particular attention to the highlight.

# Explanation

With **flat shading**, every triangle uses its geometric face normal. Each triangle therefore has a uniform colour, keeping the facets visible.

With **Gouraud shading**, illumination is calculated in the vertex shader. The resulting colours are interpolated across the triangle. This is efficient, but it can miss small highlights or highlights that fall between vertices.

With **per-fragment illumination**, normals and positions are interpolated first, then illumination is evaluated in the fragment shader. This produces more accurate highlights and a smoother surface.

The three objects are instances of one mesh. `gl_InstanceID` selects `0 = flat shading`, `1 = Gouraud shading`, and `2 = per-fragment illumination`.
