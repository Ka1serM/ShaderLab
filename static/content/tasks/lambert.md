---
category: Illumination
title: Lambert
shaderStages:
  - fragment
camera:
  position: [2.5, 2.5, 2.5]
  target: [0, 0, 0]
  fov: 30
scenes:
  - objects:
      - source: models/HeadDavid.glb
---

# Task
Implementiere im Fragment-Shader die Beleuchtung nach dem **Lambert-Beleuchtungsmodell**. Die Normale eines Fragments wird aus dem Vertex-Shader übergeben; nutze sie, um den diffusen Lichtanteil für die Szene zu bestimmen.

1. **Lichtquelle und Material:** Lege eine gerichtete Lichtquelle sowie eine Grundfarbe für das Material fest. Beurteile das Bildergebnis und korrigiere mögliche Fehler.
2. **Diffuser Lichtanteil:** Ergänze für die vorhandene Lichtquelle den diffusen Anteil aus dem Winkel zwischen Normale und Lichtrichtung. Lege einen diffusen Reflexionskoeffizienten fest und prüfe das Ergebnis in der Vorschau.

Der diffuse Anteil darf nur auf der der Lichtquelle zugewandten Seite entstehen. Beurteile das Bildergebnis nach jedem Schritt und behebe auftretende Fehler.

# Theory
Ein Lambert-Reflektor streut einfallendes Licht ideal diffus. Seine Helligkeit hängt vom Winkel zwischen der Oberflächennormalen `N` und dem Vektor `L` zur Lichtquelle ab. Für normierte Vektoren gilt:

`Id = Ip · kd · max(N · L, 0)`

Das Skalarprodukt entspricht dem Kosinus des Winkels. Es ist maximal, wenn die Fläche zur Lichtquelle zeigt, wird bei 90° null und wird für abgewandte Flächen auf null begrenzt. `Ip` ist die RGB-Intensität der Lichtquelle, `kd` der diffuse RGB-Reflexionskoeffizient des Materials.

# Starter Fragment Shader
```glsl
// @prefix
precision highp float;
// @prefix

in vec3 vNormal;
out vec4 fragColor;

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
  vec3 normal = normalize(vNormal);
  vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
  vec3 baseColor = vec3(0.8, 0.4, 0.2);
  float diffuse = max(dot(normal, lightDir), 0.0);
  vec3 color = baseColor * diffuse;
  fragColor = vec4(color, 1.0);
}
```
