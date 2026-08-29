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
Implementiere den diffusen Anteil des lokalen Beleuchtungsmodells für eine Richtungslichtquelle.

- Normalisiere Oberflächennormale `N` und Lichtvektor `L`.
- Berechne `max(dot(N, L), 0.0)`, damit rückseitige Flächen keinen negativen Lichtbeitrag erhalten.
- Multipliziere den Faktor kanalweise mit Lichtintensität, Materialkoeffizient `kd` und Grundfarbe.

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
Ein Lambert-Reflektor streut einfallendes Licht ideal diffus. Seine Helligkeit hängt vom Winkel zwischen der normierten Oberflächennormalen `N` und dem normierten Vektor `L` zur Lichtquelle ab:

`Id = Ip · kd · max(N · L, 0)`

Das Skalarprodukt entspricht dem Kosinus des Winkels. Es ist maximal, wenn die Fläche zur Lichtquelle zeigt, wird bei 90° null und wird für abgewandte Flächen auf null begrenzt. `Ip` ist die RGB-Intensität der Lichtquelle, `kd` der diffuse RGB-Reflexionskoeffizient des Materials. Im Shader wird die Normale vom Vertex- zum Fragment-Shader interpoliert und vor der Rechnung erneut normalisiert.

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
