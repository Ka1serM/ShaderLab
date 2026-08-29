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
// @control lightDir vec3 label="Light Direction" default="1,1,1" visualize=vector
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

Verändere die Materialparameter des Phong-Beleuchtungsmodells und beobachte diffusen Anteil, Spiegelstärke und Glanzlichtgröße.

# Explanation

Das lokale Phong-Beleuchtungsmodell addiert ambienten, diffusen und spekularen Anteil. Für jede Lichtquelle gilt sinngemäß `I = Ia·ka + Ip·[kd·max(N·L,0) + ks·max(V·R,0)^n]`. Farben und Koeffizienten werden kanalweise als RGB-Werte verrechnet.

`kd` bestimmt die diffuse Reflexion, `ks` die spiegelnde Reflexion und der Exponent `n` die Konzentration des Glanzlichts. Alle Richtungsvektoren müssen normiert sein. Das Phong-Beleuchtungsmodell beschreibt die Reflexion und ist nicht dasselbe wie Phong Shading: Beim Phong Shading werden Normalen interpoliert und die Beleuchtung pro Fragment ausgewertet—genau das geschieht in diesem Shader.
