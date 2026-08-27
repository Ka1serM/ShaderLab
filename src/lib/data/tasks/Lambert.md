---
category: Illumination
type: 3D
title: Lambert
shaderStages:
  - fragment
camera:
  position: [2.5, 2.5, 2.5]
  target: [0, 0, 0]
  fov: 30
modelPath: models/HeadDavid.glb
---

# Task
Erstelle ein Programm, das diffuse Beleuchtung basierend auf einer Richtungslichtquelle implementiert.  

- erster Stichpunkt
- zweiter Stichpunkt

# Hints

## Hint
Transformiere die Normalen korrekt mit der `normalMatrix` für eine richtige Beleuchtung.

## Hint
Berechne den Diffusfaktor mit `dot(normal, lightDir)`.

## Hint
Klippe den Diffuswert mit `max()`, um negative Beleuchtung zu vermeiden.

## Hint
Multipliziere die Basisfarbe mit dem Diffusfaktor, um die endgültige Beleuchtung zu erhalten.

# Theory
Lambert-Beleuchtung ist ein einfaches Modell für diffuse Lichtberechnung, bei dem die Helligkeit einer Oberfläche vom Winkel zwischen der **Oberflächennormalen** und der **Richtung der Lichtquelle** abhängt.

In **GLSL** werden die Normalen der Vertices über `out`-Variablen an den Fragment-Shader weitergegeben. Der diffuse Beleuchtungsfaktor wird als **Skalarprodukt** zwischen der normalisierten Normalen und der normalisierten Licht-Richtung berechnet:

# Starter Vertex Shader
```glsl

precision highp float;

in vec3 position;
in vec3 normal;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

out vec3 vNormal;

void main() {
  // transform normal to view space and pass to fragment shader
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
```

# Starter Fragment Shader
```glsl
// @prefix
precision highp float;

in vec3 vNormal;
out vec4 fragColor;
// @prefix

void main() {
  fragColor = vec4(0.18, 0.18, 0.18, 1.0);
}
```


# Reference Vertex Shader
```glsl

precision highp float;

in vec3 position;
in vec3 normal;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

out vec3 vNormal;

void main() {
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
```

# Reference Fragment Shader
```glsl

precision highp float;

in vec3 vNormal;
out vec4 fragColor;

void main() {
  vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
  vec3 baseColor = vec3(0.8, 0.4, 0.2);
  float diffuse = max(dot(vNormal, lightDir), 0.0);
  vec3 color = baseColor * diffuse;
  fragColor = vec4(color, 1.0);
}
```
