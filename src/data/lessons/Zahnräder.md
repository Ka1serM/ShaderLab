---
category: Grundlagen Computergrafik
type: 3D
title: Zahnräder
modelPath: models/Gear.glb
instanceCount: 3
hints:
- Verwende gl_InstanceID, um zwischen den Zahnrädern im Shader zu unterscheiden.
- Die Reihenfolge der Matrixmultiplikation ist entscheidend: Translation * Rotation * Skalierung wendet die Skalierung zuerst an.
- Um eine Hierarchie (z. B. Zahnrad C greift in B ein) zu erzeugen, multipliziere die Transformationen der Zahnräder abhängig voneinander.
- Benutze den time-Uniform, um die Rotationen zu animieren.
---

# Task
Erstelle ein hierarchisches System aus drei Zahnrädern (A, B, C).  
Alle Zahnräder sollen sich um ihre jeweilige Achse drehen, und die Drehungen sollen so abgestimmt sein, dass sie korrekt ineinandergreifen.  
Die Transformationen werden ausschließlich im **Vertex Shader** unter Verwendung von Matrizen und dem **gl_InstanceID** berechnet.

# Theory
Zahnräder sind ein klassisches Beispiel für gekoppelte, gegenläufige Rotationen.  
Wenn Zahnrad A sich im Uhrzeigersinn dreht, muss Zahnrad B sich entgegengesetzt drehen, und Zahnrad C wiederum entgegengesetzt zu B.  
Diese Bewegung kann durch Rotationsmatrizen im Shader simuliert werden.

Die finale Matrix für jedes Zahnrad setzt sich zusammen aus: finalMatrix = projectionMatrix * viewMatrix * translation * rotation * scale

Um Abhängigkeiten (z. B. Zahnrad C hängt an B) zu simulieren:

finalCMatrix = projectionMatrix * viewMatrix * transformB * localCMatrix


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

mat4 rotationZ(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat4(
        c, -s, 0.0, 0.0,
        s,  c, 0.0, 0.0,
        0.0, 0.0, 1.0, 0.0,
        0.0, 0.0, 0.0, 1.0
    );
}

void main() {
    mat4 modelMatrix = mat4(1.0);

    if (gl_InstanceID == 0) {
        // --- Zahnrad A ---
        vColor = vec3(1.0, 0.4, 0.2); // orange
        mat4 rotA = rotationZ(time * 0.2 * 6.2831); // 1/10 Umdrehung pro Sekunde
        mat4 transA = translation(vec3(20.0, 10.0, 0.0));
        modelMatrix = transA * rotA;

    } else if (gl_InstanceID == 1) {
        // --- Zahnrad B ---
        vColor = vec3(0.2, 0.6, 1.0); // blau
        // Zahnrad B greift in A → gegenläufige Rotation
        mat4 rotB = rotationZ(-time * 0.4 * 6.2831);
        mat4 transB = translation(vec3(47.0, 2.0, 0.0));
        modelMatrix = transB * rotB;

    } else if (gl_InstanceID == 2) {
        // --- Zahnrad C ---
        vColor = vec3(0.7, 0.8, 0.2); // gelbgrün
        // Zahnrad C greift in B → wieder gegenläufig
        mat4 rotC = rotationZ(time * 0.8 * 6.2831);
        mat4 transB = translation(vec3(47.0, 2.0, 0.0));
        mat4 rotB = rotationZ(-time * 0.4 * 6.2831);
        mat4 transformB = transB * rotB;

        mat4 localC = translation(vec3(20.0, 12.0, 0.0)) * rotC * scale(vec3(10.0, 10.0, 1.0));
        modelMatrix = transformB * localC;
    }

    // Normals korrekt transformieren
    mat3 normalMatrix = mat3(transpose(inverse(modelMatrix)));
    vNormal = normalize(normalMatrix * normal);

    gl_Position = projectionMatrix * modelViewMatrix * modelMatrix * vec4(position, 1.0);
}
```

# Starter Fragment Shader
```glsl
precision highp float;

in vec3 vNormal;
in vec3 vColor;

out vec4 fragColor;

void main() {
    vec3 lightDir = normalize(vec3(0.5, 0.5, 1.0));
    float diffuse = max(dot(normalize(vNormal), lightDir), 0.0);
    float ambient = 0.2;
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

mat4 rotationX(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat4(
        1.0, 0.0, 0.0, 0.0,
        0.0, c, -s, 0.0,
        0.0, s,  c, 0.0,
        0.0, 0.0, 0.0, 1.0
    );
}

void main() {
    mat4 modelMatrix = mat4(1.0);

    // Radii for spacing
    float radiusA = 2.0;
    float radiusB = 1.0;
    float radiusC = 1.5;

    if (gl_InstanceID == 0) {
        // --- Zahnrad A ---
        vColor = vec3(1.0, 0.4, 0.2);
        mat4 sA = scale(vec3(2.0));
        mat4 rotA = rotationX(time * 0.2 * 6.2831);
        mat4 transA = translation(vec3(0.0, -0.5, 0.0));
        modelMatrix = transA * rotA * sA;

    } else if (gl_InstanceID == 1) {
        // --- Zahnrad B ---
        vColor = vec3(0.2, 0.6, 1.0);
        mat4 sB = scale(vec3(1.0));
        mat4 rotB = rotationX(-time * 0.4 * 6.2831);
        // place B right next to A
        mat4 transB = translation(vec3(0.0, radiusA + radiusB, 0.0));
        modelMatrix = transB * rotB * sB;

    } else if (gl_InstanceID == 2) {
        // --- Zahnrad C ---
        vColor = vec3(0.7, 0.8, 0.2);
        mat4 sC = scale(vec3(1.5));
        mat4 rotC = rotationX(time * 0.6 * 6.2831);
        // place C right next to B
        float yB = radiusA + radiusB + 0.5;
        float yC = yB + radiusB + radiusC; // sum distances
        mat4 transC = translation(vec3(0.0, yC, 0.0));
        modelMatrix = transC * rotC * sC;
    }

    // Normals korrekt transformieren
    mat3 normalMatrix = mat3(transpose(inverse(modelMatrix)));
    vNormal = normalize(normalMatrix * normal);

    gl_Position = projectionMatrix * modelViewMatrix * modelMatrix * vec4(position, 1.0);
}
```

# Reference Fragment Shader
```glsl
precision highp float;

in vec3 vNormal;
in vec3 vColor;

out vec4 fragColor;

void main() {
    vec3 lightDir = normalize(vec3(0.5, 0.5, 1.0));
    float diffuse = max(dot(normalize(vNormal), lightDir), 0.0);
    float ambient = 0.2;
    vec3 finalColor = vColor * (diffuse + ambient);
    fragColor = vec4(finalColor, 1.0);
}
```