---
category: Grundlagen Computergrafik
type: 3D
title: Lambert
modelPath: models/HeadDavid.glb
hints:
  - Transformiere die Normalen korrekt mit der `normalMatrix` für eine richtige Beleuchtung
  - Berechne den Diffusfaktor mit dot(normal, lightDir)
  - Klippe den Diffuswert mit max(), um negative Beleuchtung zu vermeiden
  - Multipliziere die Basisfarbe mit dem Diffusfaktor, um die endgültige Beleuchtung zu erhalten
---

# Task
Erstelle ein Programm, das diffuse Beleuchtung basierend auf einer Richtungslichtquelle implementiert.  

- erster Stichpunkt
- zweiter Stichpunkt

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

precision highp float;

in vec3 vNormal;
out vec4 fragColor;

void main() {
  // simple placeholder white color
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