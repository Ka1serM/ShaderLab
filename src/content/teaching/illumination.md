---
title: Illumination
category: Illumination
shaderStages:
  - fragment
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
precision highp float;

in vec3 position;
in vec3 normal;

uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

out vec3 vNormal;
out vec3 vPosition;

void main() {
  vNormal = normalize(mat3(transpose(inverse(modelMatrix))) * normal);
  vPosition = vec3(modelMatrix * vec4(position, 1.0));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
```

# Fragment Shader
```glsl
// @prefix
precision highp float;

in vec3 vNormal;
in vec3 vPosition;
out vec4 fragColor;
// @prefix

// @control display=color label="Ambient" default="0.01,0.01,0.015"
uniform vec3 uAmbient;

// @control display=color label="Diffuse Kd" default="0.5,0.5,0.5"
uniform vec3 uKd;

// @control display=color label="Specular Ks" default="1,1,1"
uniform vec3 uKs;

// @control label="Shininess n" min=1 max=256 step=1 default=32
uniform float uShininess;

// @control label="Light Position" default="0,1,2" visualize=point
uniform vec3 uLightPosition;

// @control label="Extra lights" default=true
uniform bool uExtraLights;

uniform vec3 cameraPosition;

struct Light {
  vec3 position;
  vec3 color;
  float intensity;
};

vec3 phongLight(vec3 normal, vec3 viewDir, Light light) {
  vec3 lightDir = normalize(light.position - vPosition);

  float nDotL = dot(normal, lightDir);
  float diffuseFactor = 0.0;
  if (nDotL > 0.0) {
    diffuseFactor = nDotL;
  }

  vec3 reflectDir = 2.0 * dot(normal, lightDir) * normal - lightDir;
  float rDotV = dot(reflectDir, viewDir);
  float specularFactor = 0.0;
  if (rDotV > 0.0) {
    specularFactor = pow(rDotV, uShininess);
  }

  vec3 diffuse = uKd * diffuseFactor;
  vec3 specular = uKs * specularFactor;

  return light.color * light.intensity * (diffuse + specular);
}

void main() {
  const int LIGHT_COUNT = 4;
  Light lights[LIGHT_COUNT] = Light[](
    Light(uLightPosition,         vec3(1.0, 0.85, 0.7), 1.0),
    Light(vec3(-4.0, 1.0, -1.5),  vec3(1.0, 0.0, 0.0),  1.4),
    Light(vec3(4.0, 0.5, -1.5),   vec3(0.0, 1.0, 0.0),  1.2),
    Light(vec3(-2.0, -3.0, 2.0),  vec3(1.0, 1.0, 0.0),  0.15)
  );

  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(cameraPosition - vPosition);

  vec3 color = uAmbient;
  for (int i = 0; i < LIGHT_COUNT; i++) {
    if (i > 0 && !uExtraLights) continue;

    color += phongLight(normal, viewDir, lights[i]);
  }

  fragColor = vec4(color, 1.0);
}
```

# Overview

Adjust the Phong material parameters and observe the diffuse contribution, specular strength, and highlight size.

# Explanation

The local Phong illumination model adds ambient, diffuse, and specular contributions. For each light source, it follows `I = Ia·ka + Ip·[kd·max(N·L,0) + ks·max(V·R,0)^n]`. Colours and coefficients are combined channel by channel in RGB.

With several lights, the diffuse and specular terms are summed over all lights, and the ambient term is added once. "Extra lights" turns the warm key light into a cinematic setup: a red and a green rim light from the sides outline the silhouette, and a dim yellow fill light from below lifts the shadows.

`kd` controls diffuse reflection, `ks` controls specular reflection, and exponent `n` concentrates the highlight. Each light is a point light: its direction `L` is the normalized vector from the surface point to the light position, so it changes across the surface. All direction vectors must be normalized. Phong illumination describes reflection; it is not the same thing as Phong shading. With Phong shading, normals are interpolated and illumination is evaluated per fragment—as it is in this shader.
