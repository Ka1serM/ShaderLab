---
category: Grundlagen Computergrafik
type: 3D
title: Planeten System
modelPath: models/Sphere.glb
instanceCount: 10
hints:
- Verwende gl_InstanceID, um zwischen den Planeten im Shader zu unterscheiden.
- Die Reihenfolge der Matrixmultiplikation ist entscheidend: Translation * Rotation * Skalierung wendet die Skalierung zuerst an.
- Um eine Hierarchie zu schaffen (z.B. Mond um Erde), multipliziere die Transformation des Kindes mit der des Elternteils: earthMatrix * moonMatrix.
- Benutze den time-Uniform, um die Rotationswinkel zu animieren.
---

# Task
Erstelle ein hierarchisches Planetensystem (Sonne, Erde, Mond) mithilfe von Instancing. Alle Transformationslogiken, wie Rotation und Translation, sollen direkt im Vertex-Shader unter Verwendung von Matrizen und dem gl_InstanceID implementiert werden.

# Theory
Hierarchische Transformationen ermöglichen es, Objekte relativ zueinander zu positionieren und zu bewegen. In der Computergrafik wird dies durch die Multiplikation von Transformationsmatrizen erreicht.

Ein Objekt (z.B. der Mond) kann an ein anderes Objekt (die Erde) "gebunden" werden, indem seine eigene lokale Transformation (Rotation und Abstand zur Erde) mit der Transformation des Elternobjekts (die Position der Erde im Sonnensystem) multipliziert wird.

Die finale Transformationsmatrix für den Mond wäre also:
finalMoonMatrix = projectionMatrix * viewMatrix * earthMatrix * localMoonMatrix

Indem wir dies für jede Instanz im Vertex-Shader tun, können wir mit einem einzigen Draw-Call ein ganzes, animiertes System rendern.

# Starter Vertex Shader
```glsl
precision highp float;

in vec3 position;
in vec3 normal;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float time;

out vec3 vNormal;
out vec3 vColor;

void main() {
    if (gl_InstanceID == 0) {
        // --- Sonne ---

    } else if (gl_InstanceID == 1) {
        // --- Erde ---

    } else if (gl_InstanceID == 2) {
        // --- Mond ---
   
    }

    vColor = vec3(1.0, 0.8, 0.2);
    vNormal = normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
```

# Starter Fragment Shader
```glsl
precision highp float;

in vec3 vNormal;
in vec3 vColor; // Farbe vom Vertex Shader empfangen

out vec4 fragColor;

void main() {
    vec3 lightDir = normalize(vec3(0.5, 0.5, 1.0)); // world-space light
    float diffuse = max(dot(normalize(vNormal), lightDir), 0.0);
        
    // Umgebungslicht, damit die dunkle Seite nicht komplett schwarz ist
    float ambient = 0.2;
    
    // Farbe mit Beleuchtung kombinieren
    vec3 finalColor = vColor * (diffuse + ambient);
    
    fragColor = vec4(finalColor, 1.0);
}
```

# Reference Vertex Shader
```glsl
precision highp float;

in vec3 position;
in vec3 normal;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float time;

out vec3 vNormal;
out vec3 vColor;

// Helper functions
mat4 translation(vec3 t) {
    return mat4(
        1.0, 0.0, 0.0, 0.0,
        0.0, 1.0, 0.0, 0.0,
        0.0, 0.0, 1.0, 0.0,
        t.x, t.y, t.z, 1.0
    );
}

mat4 scale(vec3 s) {
    return mat4(
        s.x, 0.0, 0.0, 0.0,
        0.0, s.y, 0.0, 0.0,
        0.0, 0.0, s.z, 0.0,
        0.0, 0.0, 0.0, 1.0
    );
}

mat4 rotationY(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat4(
        c, 0.0, s, 0.0,
        0.0, 1.0, 0.0, 0.0,
        -s, 0.0, c, 0.0,
        0.0, 0.0, 0.0, 1.0
    );
}

void main() {
mat4 modelMatrix = mat4(1.0);

// Declare variables for artistic scale and orbital speed
float planetScale = 0.25;  // default, overridden below
float speed = 0.0;   // default, overridden below

if (gl_InstanceID == 0) {
    // Sun
    vColor = vec3(1.0, 0.8, 0.2);
    planetScale = 2.0;
    modelMatrix = scale(vec3(planetScale));

} else if (gl_InstanceID == 1) {
    // Earth
    vColor = vec3(0.2, 0.4, 1.0);
    planetScale = 0.7;
    speed = 1.0;
    modelMatrix = rotationY(time * speed) * translation(vec3(5.0, 0.0, 0.0)) * scale(vec3(planetScale));

} else if (gl_InstanceID == 2) {
    // Moon
    vColor = vec3(0.5, 0.5, 0.5);
    planetScale = 0.25;
    speed = 12.0; // fast around Earth
    mat4 earthMatrix = rotationY(time * 1.0) * translation(vec3(5.0, 0.0, 0.0));
    mat4 moonMatrix  = rotationY(time * speed) * translation(vec3(1.5, 0.0, 0.0)) * scale(vec3(planetScale));
    modelMatrix = earthMatrix * moonMatrix;

} else if (gl_InstanceID == 3) {
    // Mercury
    vColor = vec3(0.8, 0.6, 0.4);
    planetScale = 0.3;
    speed = 4.15;
    modelMatrix = rotationY(time * speed) * translation(vec3(3.0, 0.0, 0.0)) * scale(vec3(planetScale));

} else if (gl_InstanceID == 4) {
    // Venus
    vColor = vec3(1.0, 0.7, 0.3);
    planetScale = 0.5;
    speed = 1.62;
    modelMatrix = rotationY(time * speed) * translation(vec3(4.0, 0.0, 0.0)) * scale(vec3(planetScale));

} else if (gl_InstanceID == 5) {
    // Mars
    vColor = vec3(1.0, 0.3, 0.2);
    planetScale = 0.5;
    speed = 0.53;
    modelMatrix = rotationY(time * speed) * translation(vec3(7.0, 0.0, 0.0)) * scale(vec3(planetScale));

} else if (gl_InstanceID == 6) {
    // Jupiter
    vColor = vec3(1.0, 0.9, 0.6);
    planetScale = 1.5;
    speed = 0.08;
    modelMatrix = rotationY(time * speed) * translation(vec3(10.0, 0.0, 0.0)) * scale(vec3(planetScale));

} else if (gl_InstanceID == 7) {
    // Saturn
    vColor = vec3(0.9, 0.8, 0.5);
    planetScale = 1.2;
    speed = 0.03;
    modelMatrix = rotationY(time * speed) * translation(vec3(13.0, 0.0, 0.0)) * scale(vec3(planetScale));

} else if (gl_InstanceID == 8) {
    // Uranus
    vColor = vec3(0.5, 0.9, 1.0);
    planetScale = 1.0;
    speed = 0.01;
    modelMatrix = rotationY(time * speed) * translation(vec3(16.0, 0.0, 0.0)) * scale(vec3(planetScale));

} else if (gl_InstanceID == 9) {
    // Neptune
    vColor = vec3(0.3, 0.5, 1.0);
    planetScale = 0.95;
    speed = 0.006;
    modelMatrix = rotationY(time * speed) * translation(vec3(19.0, 0.0, 0.0)) * scale(vec3(planetScale));
}

// Normals
mat3 normalMatrix = mat3(transpose(inverse(modelMatrix)));
vNormal = normalize(normalMatrix * normal);
gl_Position = projectionMatrix * modelViewMatrix * modelMatrix * vec4(position, 1.0);
}
```

# Reference Fragment Shader
```glsl
precision highp float;

in vec3 vNormal;
in vec3 vColor; // Farbe vom Vertex Shader empfangen

out vec4 fragColor;

void main() {
    vec3 lightDir = normalize(vec3(0.5, 0.5, 1.0)); // world-space light
    float diffuse = max(dot(normalize(vNormal), lightDir), 0.0);
        
    // Umgebungslicht, damit die dunkle Seite nicht komplett schwarz ist
    float ambient = 0.2;
    
    // Farbe mit Beleuchtung kombinieren
    vec3 finalColor = vColor * (diffuse + ambient);
    
    fragColor = vec4(finalColor, 1.0);
}
```