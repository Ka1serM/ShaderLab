---
type: 3D
title: Phong
modelPath: models/HeadDavid.glb
hints:
  - Transformiere die Normalen korrekt mit der `normalMatrix` für eine richtige Beleuchtung
  - Berechne die diffuse Komponente mit `dot(normal, lightDir)` und clamp sie mit `max()`
  - Berechne die specular Komponente mit `pow(max(dot(reflectDir, viewDir), 0.0), shininess)`
  - Addiere ambient, diffuse und specular Komponente, um die endgültige Beleuchtung zu erhalten
---

# Task
Erstelle ein Programm, das **Phong-Beleuchtung** basierend auf einer Richtungslichtquelle implementiert.  

- erster Stichpunkt
- zweiter Stichpunkt

# Theory
Phong-Beleuchtung ist ein Modell für diffuse und spiegelnde Beleuchtung. Die Helligkeit einer Oberfläche hängt von drei Komponenten ab:

1. **Ambient**: Grundhelligkeit der Szene
2. **Diffuse**: Helligkeit basierend auf dem Winkel zwischen Normalen und Lichtquelle
3. **Specular**: Glanzlichter basierend auf dem Winkel zwischen reflektiertem Licht und Blickrichtung

In **GLSL** werden die Normalen der Vertices über `varying`-Variablen an den Fragment-Shader weitergegeben. Diffuse und specular werden berechnet und dann mit der Basisfarbe kombiniert.

# Starter Vertex Shader
```glsl
precision highp float;

attribute vec3 position;
attribute vec3 normal;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  // compute normal in view space
  vNormal = normalize(normalMatrix * normal);
  vPosition = vec3(modelViewMatrix * vec4(position, 1.0));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
```

# Starter Fragment Shader
```glsl
precision highp float;
varying vec3 vNormal;
varying vec3 vPosition;

// Write your fragment shader here
void main() {
  gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
}
```

# Reference Vertex Shader
```glsl
precision highp float;

attribute vec3 position;
attribute vec3 normal;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vPosition = vec3(modelViewMatrix * vec4(position, 1.0));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
```

# Reference Fragment Shader
```glsl
precision highp float;
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
  vec3 viewDir = normalize(-vPosition);
  vec3 baseColor = vec3(0.8, 0.4, 0.2);

  // Diffuse
  float diffuse = max(dot(vNormal, lightDir), 0.0);

  // Specular
  vec3 reflectDir = reflect(-lightDir, vNormal);
  float specular = pow(max(dot(reflectDir, viewDir), 0.0), 32.0);

  // Ambient
  vec3 ambient = vec3(0.1);

  vec3 color = ambient + baseColor * diffuse + specular * vec3(1.0);
  gl_FragColor = vec4(color, 1.0);
}
```
