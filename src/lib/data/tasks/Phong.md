---
category: Illumination
type: 3D
title: Phong
shaderStages:
  - fragment
camera:
  position: [2.5, 2.5, 2.5]
  target: [0, 0, 0]
  fov: 30
modelPath: models/HeadDavid.glb
---

# Task
Erstelle ein Programm, das **Phong-Beleuchtung** basierend auf einer Richtungslichtquelle implementiert.  

- erster Stichpunkt
- zweiter Stichpunkt

# Hints

## Hint
Transformiere die Normalen korrekt mit der `normalMatrix` für eine richtige Beleuchtung.

## Hint
Berechne die diffuse Komponente mit `dot(normal, lightDir)` und clamp sie mit `max()`.

## Hint
Berechne die specular Komponente mit `pow(max(dot(reflectDir, viewDir), 0.0), shininess)`.

## Hint
Addiere ambient, diffuse und specular Komponente, um die endgültige Beleuchtung zu erhalten.

# Theory
Phong-Beleuchtung ist ein Modell für diffuse und spiegelnde Beleuchtung. Die Helligkeit einer Oberfläche hängt von drei Komponenten ab:

1. **Ambient**: Grundhelligkeit der Szene
2. **Diffuse**: Helligkeit basierend auf dem Winkel zwischen Normalen und Lichtquelle
3. **Specular**: Glanzlichter basierend auf dem Winkel zwischen reflektiertem Licht und Blickrichtung

In **GLSL** werden die Normalen der Vertices über `out`-Variablen an den Fragment-Shader weitergegeben. Diffuse und specular werden berechnet und dann mit der Basisfarbe kombiniert.

# Starter Vertex Shader
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

# Starter Fragment Shader
```glsl
// @prefix
precision highp float;

in vec3 vNormal;
in vec3 vPosition;

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

# Reference Fragment Shader
```glsl

precision highp float;

in vec3 vNormal;
in vec3 vPosition;

out vec4 fragColor;

uniform vec3 cameraPosition;

void main() {
    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
    vec3 viewDir = normalize(cameraPosition - vPosition);
    vec3 baseColor = vec3(0.8, 0.4, 0.2);

    // Diffuse component
    float diffuse = max(dot(vNormal, lightDir), 0.0);

    // Specular component
    vec3 reflectDir = reflect(-lightDir, vNormal);
    float specular = pow(max(dot(reflectDir, viewDir), 0.0), 32.0);

    // Ambient component
    vec3 ambient = vec3(0.1);

    vec3 color = ambient + baseColor * diffuse + specular * vec3(1.0);
    fragColor = vec4(color, 1.0);
}
```
