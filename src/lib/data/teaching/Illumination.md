---
title: Illumination
category: Illumination
task: Phong
scene:
  objects:
    - source: models/Sphere.glb
      position: [-1.2, 0, 0]
      scale: [0.8, 0.8, 0.8]
    - source: models/HeadDavid.glb
      position: [1.2, 0, 0]
      scale: [0.8, 0.8, 0.8]
---

# Fragment Shader
```glsl
// @prefix
precision highp float;

in vec3 vNormal;
in vec3 vPosition;
out vec4 fragColor;
// @prefix

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

void main() {
  vec3 lightDir = normalize(uLightDir);
  vec3 viewDir = normalize(cameraPosition - vPosition);
  float nDotL = dot(vNormal, lightDir);
  float diffuseFactor = 0.0;
  if (nDotL > 0.0) {
    diffuseFactor = nDotL;
  }

  vec3 reflectDir = 2.0 * dot(vNormal, lightDir) * vNormal - lightDir;
  float rDotV = dot(reflectDir, viewDir);
  float specularFactor = 0.0;
  if (rDotV > 0.0) {
    specularFactor = pow(rDotV, uShininess);
  }

  vec3 diffuse = uKd * diffuseFactor;
  vec3 specular = uKs * specularFactor;
  vec3 color = uAmbient + diffuse + specular;
  fragColor = vec4(color, 1.0);
}
```

# Overview

Adjust the Phong material parameters and observe the diffuse contribution, specular strength, and highlight size.

# Explanation

The local Phong illumination model adds ambient, diffuse, and specular contributions. For each light source, it follows `I = Ia·ka + Ip·[kd·max(N·L,0) + ks·max(V·R,0)^n]`. Colours and coefficients are combined channel by channel in RGB.

`kd` controls diffuse reflection, `ks` controls specular reflection, and exponent `n` concentrates the highlight. All direction vectors must be normalized. Phong illumination describes reflection; it is not the same thing as Phong shading. With Phong shading, normals are interpolated and illumination is evaluated per fragment—as it is in this shader.
