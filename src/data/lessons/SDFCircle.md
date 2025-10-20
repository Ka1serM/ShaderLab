---
category: Grundlagen Computergrafik
type: 2D
title: SDF Circle
modelPath: models/Cube.glb
hints:
  - Berechne den Abstand von jedem Pixel zum Zentrum der Fläche
  - Verwende `length(position - center)` für den Abstand
  - Verwende `smoothstep()` für weiche Kanten
  - Setze die Farbe basierend auf dem Vorzeichen des Abstands
---

# Task
Erstelle ein Fragment-Shader-Programm, das einen **Signed Distance Field (SDF) Kreis** zeichnet.  

- Berechne für jedes Pixel den Abstand zum Kreis-Zentrum
- Färbe die Pixel innerhalb des Kreises anders als die außerhalb

# Theory
Signed Distance Fields (SDFs) speichern für jedes Pixel den **Abstand zur nächstgelegenen Oberfläche**.  
- Negative Werte: innerhalb des Objekts  
- Positive Werte: außerhalb des Objekts  
- Null: auf der Kontur  

Für einen Kreis: `distance = length(pixelPos - center) - radius`.  
Die Farbe kann dann z.B. über `smoothstep()` interpoliert werden, um weiche Kanten zu erzeugen.

# Starter Vertex Shader
```glsl
precision highp float;

in vec3 position;
in vec3 normal;
in vec2 uv;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

out vec2 vUV;
out vec3 vNormal;

void main() {
    vUV = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = vec4(position, 1.0);
}
```

# Starter Fragment Shader
```glsl
precision highp float;

in vec2 vUV;
out vec4 fragColor;

void main() {
    // Simple placeholder: dark gray background
    fragColor = vec4(0.1, 0.1, 0.1, 1.0);
}
```

# Reference Vertex Shader
```glsl
precision highp float;

in vec3 position;
in vec3 normal;
in vec2 uv;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

out vec2 vUV;
out vec3 vNormal;

void main() {
    vUV = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = vec4(position, 1.0);
}
```

# Reference Fragment Shader
```glsl

precision highp float;

in vec2 vUV;
out vec4 fragColor;

void main() {
    vec2 center = vec2(0.5, 0.5);
    float radius = 0.25;

    float dist = length(vUV - center);

    // Solid red circle
    vec3 color = dist < radius ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 0.0);
    fragColor = vec4(color, 1.0);
}
```