---
id: phong
title: Phong
category: Lighting
task: Phong
type: shader-controls
scene:
  objects:
    - id: sphere
      source:
        type: primitive
        geometry: sphere
      position: [-1.2, 0, 0]
      scale: [0.8, 0.8, 0.8]
    - id: head
      source:
        type: model
        path: models/HeadDavid.glb
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

// @control ambient color label="Ambient" default="0.1,0.1,0.1"
uniform vec3 uAmbient;
// @control kd color label="Diffuse Kd" default="1,1,1"
uniform vec3 uKd;
// @control ks color label="Specular Ks" default="0.3,0.3,0.3"
uniform vec3 uKs;
// @control shininess slider label="Shininess n" min=1 max=256 step=1 default=32
uniform float uShininess;
// @control lightDir vec3 label="Light Direction" default="1,1,1"
uniform vec3 uLightDir;
uniform vec3 cameraPosition;

void main() {
  vec3 lightDir = normalize(uLightDir);
  vec3 viewDir = normalize(cameraPosition - vPosition);
  float nDotL = dot(vNormal, lightDir);
  float diffuse = 0.0;
  if (nDotL > 0.0) {
    diffuse = nDotL;
  }

  vec3 reflectDir = reflect(-lightDir, vNormal);
  float rDotV = dot(reflectDir, viewDir);
  float specularFactor = 0.0;
  if (nDotL > 0.0 && rDotV > 0.0) {
    specularFactor = pow(rDotV, uShininess);
  }

  vec3 specular = uKs * specularFactor;
  vec3 color = uAmbient + uKd * diffuse + specular;
  fragColor = vec4(color, 1.0);
}
```

# Overview

Change the Phong parameters live and observe how diffuse brightness, specular intensity, and highlight size change.

# Explanation

`Kd` scales the diffuse component, `Ks` scales the specular component, and `n` controls the concentration of the highlight.
