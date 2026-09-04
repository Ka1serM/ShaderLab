---
category: Transformation
title: Planeten System
showTimeControl: true
shaderStages:
  - vertex
camera:
  position: [8.5, 8.5, 8.5]
  target: [0, 0, 0]
  fov: 30
scenes:
  - objects:
      - source: models/Sphere.glb
        instanceCount: 6
---

# Task
Erstelle einen Szenengraphen samt Transformationen für ein animiertes Planetensystem. Die Vorschau enthält Sonne, Merkur, Venus, Erde, Mond und Mars.

1. **Szenengraph planen:** Skizziere die Konstellation des Planetensystems mit den zugehörigen Transformationen. Berücksichtige dabei auch den Root-Knoten.
2. **Erde auf Umlaufbahn:** Erstelle in `animateEarth(...)` die Transformationen, damit die Erde sich in der richtigen Größe um die eigene Achse dreht und auf ihrer Umlaufbahn um die Sonne bewegt. Die Sonne muss die Erde sichtbar beleuchten.
3. **Hierarchische Transformation:** Bilde die geplante Hierarchie über die Punkt- und Normalenmatrizen ab. Jeder Transformationsschritt soll als eigene Hilfsfunktion formuliert werden; verwende diese Funktionen in den Animationsfunktionen.
4. **Mond auf Umlaufbahn:** Ergänze `animateMoon(...)`, sodass der Mond korrekt um die Erde kreist. Die Transformationen von Kindknoten dürfen sich nicht gegenseitig beeinflussen.
5. **Verbleibende Planeten und Monde:** Ergänze Merkur, Venus und Mars mit den passenden Größen, Eigenrotationen und Umlaufbahnen.

Berechne zu jeder Punktmatrix die passende Normalenmatrix, damit die Beleuchtung auch nach Skalierungen korrekt bleibt. Zusätzliche Erweiterungen sind Bahnneigungen, Achsneigungen und Jahreszeiten.

# Hints

## Hint
Die `pointMatrix` beschreibt die vollständige Transformation eines Objekts. Die rechte Matrix wird zuerst angewendet.

# Theory
Wie im Transformationspraktikum wird pro Objekt eine **Punktmatrix** und daraus eine **Normalenmatrix** bestimmt. Die Punktmatrix transformiert Positionen. Die Normalenmatrix stellt sicher, dass Oberflächennormalen auch bei Skalierung korrekt für die Beleuchtung verwendet werden.

Die Sonne ist das Elternobjekt. Die Planeten bewegen sich relativ zur Sonne. Der Mond bewegt sich wiederum relativ zur Erde. Diese Abhängigkeit wird durch Matrixmultiplikation beschrieben.

# Starter Vertex Shader
```glsl
// @prefix
precision highp float;

in vec3 position;
in vec3 normal;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float time;

out vec3 vNormal;
out vec3 vColor;

void animateSun(float time);
void animateMercury(float time);
void animateVenus(float time);
void animateEarth(float time);
void animateMoon(float time);
void animateMars(float time);
void render();
// @prefix

mat4 sunPointMatrix;
mat4 mercuryPointMatrix;
mat4 venusPointMatrix;
mat4 earthPointMatrix;
mat4 moonPointMatrix;
mat4 marsPointMatrix;
mat3 sunNormalMatrix;
mat3 mercuryNormalMatrix;
mat3 venusNormalMatrix;
mat3 earthNormalMatrix;
mat3 moonNormalMatrix;
mat3 marsNormalMatrix;

void main() {
    animateSun(time);
    animateMercury(time);
    animateVenus(time);
    animateEarth(time);
    animateMoon(time);
    animateMars(time);
    render();
}

void animateSun(float time) {
    sunPointMatrix = mat4(1.0, 0.0, 0.0, 0.0,
                          0.0, 1.0, 0.0, 0.0,
                          0.0, 0.0, 1.0, 0.0,
                          0.0, 0.0, 0.0, 1.0);
    sunNormalMatrix = mat3(1.0);
}

void animateMercury(float time) {
    mercuryPointMatrix = sunPointMatrix;
    mercuryNormalMatrix = mat3(1.0);
}

void animateVenus(float time) {
    venusPointMatrix = sunPointMatrix;
    venusNormalMatrix = mat3(1.0);
}

void animateEarth(float time) {
    earthPointMatrix = sunPointMatrix;
    earthNormalMatrix = mat3(1.0);
}

void animateMoon(float time) {
    moonPointMatrix = earthPointMatrix;
    moonNormalMatrix = mat3(1.0);
}

void animateMars(float time) {
    marsPointMatrix = sunPointMatrix;
    marsNormalMatrix = mat3(1.0);
}

// @suffix
void render() {
    mat4 pointMatrix;
    mat3 normalMatrix;

    if (gl_InstanceID == 0) {
        pointMatrix = sunPointMatrix;
        normalMatrix = sunNormalMatrix;
        vColor = vec3(1.0, 0.8, 0.2);
    } else if (gl_InstanceID == 1) {
        pointMatrix = mercuryPointMatrix;
        normalMatrix = mercuryNormalMatrix;
        vColor = vec3(0.7, 0.7, 0.7);
    } else if (gl_InstanceID == 2) {
        pointMatrix = venusPointMatrix;
        normalMatrix = venusNormalMatrix;
        vColor = vec3(0.9, 0.7, 0.3);
    } else if (gl_InstanceID == 3) {
        pointMatrix = earthPointMatrix;
        normalMatrix = earthNormalMatrix;
        vColor = vec3(0.2, 0.4, 1.0);
    } else if (gl_InstanceID == 4) {
        pointMatrix = moonPointMatrix;
        normalMatrix = moonNormalMatrix;
        vColor = vec3(0.6);
    } else {
        pointMatrix = marsPointMatrix;
        normalMatrix = marsNormalMatrix;
        vColor = vec3(0.9, 0.3, 0.1);
    }

    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * pointMatrix * vec4(position, 1.0);
}
// @suffix
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

void animateSun(float time);
void animateMercury(float time);
void animateVenus(float time);
void animateEarth(float time);
void animateMoon(float time);
void animateMars(float time);
void render();

mat4 sunPointMatrix;
mat4 mercuryPointMatrix;
mat4 venusPointMatrix;
mat4 earthPointMatrix;
mat4 moonPointMatrix;
mat4 marsPointMatrix;
mat3 sunNormalMatrix;
mat3 mercuryNormalMatrix;
mat3 venusNormalMatrix;
mat3 earthNormalMatrix;
mat3 moonNormalMatrix;
mat3 marsNormalMatrix;

void main() {
    animateSun(time);
    animateMercury(time);
    animateVenus(time);
    animateEarth(time);
    animateMoon(time);
    animateMars(time);
    render();
}

mat4 translationMatrix(vec3 translationVector) {
    return mat4(1.0, 0.0, 0.0, translationVector.x,
                0.0, 1.0, 0.0, translationVector.y,
                0.0, 0.0, 1.0, translationVector.z,
                0.0, 0.0, 0.0, 1.0);
}

mat4 scalingMatrix(vec3 scaleVector) {
    return mat4(scaleVector.x, 0.0, 0.0, 0.0,
                0.0, scaleVector.y, 0.0, 0.0,
                0.0, 0.0, scaleVector.z, 0.0,
                0.0, 0.0, 0.0, 1.0);
}

mat4 rotationYMatrix(float rotationAngle) {
    float cosine = cos(rotationAngle);
    float sine = sin(rotationAngle);
    return mat4(cosine, 0.0, sine, 0.0,
                0.0, 1.0, 0.0, 0.0,
                -sine, 0.0, cosine, 0.0,
                0.0, 0.0, 0.0, 1.0);
}

void animateSun(float time) {
    sunPointMatrix = mat4(1.0);
    sunPointMatrix = sunPointMatrix * scalingMatrix(vec3(0.8));
    sunNormalMatrix = mat3(transpose(inverse(sunPointMatrix)));
}

void animateMercury(float time) {
    mercuryPointMatrix = sunPointMatrix;
    mercuryPointMatrix = mercuryPointMatrix * rotationYMatrix(time * 2.075);
    mercuryPointMatrix = mercuryPointMatrix * translationMatrix(vec3(2.0, 0.0, 0.0));
    mercuryPointMatrix = mercuryPointMatrix * scalingMatrix(vec3(0.15));
    mercuryNormalMatrix = mat3(transpose(inverse(mercuryPointMatrix)));
}

void animateVenus(float time) {
    venusPointMatrix = sunPointMatrix;
    venusPointMatrix = venusPointMatrix * rotationYMatrix(time * 0.81);
    venusPointMatrix = venusPointMatrix * translationMatrix(vec3(2.8, 0.0, 0.0));
    venusPointMatrix = venusPointMatrix * scalingMatrix(vec3(0.3));
    venusNormalMatrix = mat3(transpose(inverse(venusPointMatrix)));
}

void animateEarth(float time) {
    earthPointMatrix = sunPointMatrix;
    earthPointMatrix = earthPointMatrix * rotationYMatrix(time * 0.5);
    earthPointMatrix = earthPointMatrix * translationMatrix(vec3(3.8, 0.0, 0.0));
    earthPointMatrix = earthPointMatrix * scalingMatrix(vec3(0.35));
    earthNormalMatrix = mat3(transpose(inverse(earthPointMatrix)));
}

void animateMoon(float time) {
    mat4 localMoonMatrix = rotationYMatrix(time * 2.0) * translationMatrix(vec3(1.3, 0.0, 0.0)) * scalingMatrix(vec3(0.2));
    moonPointMatrix = earthPointMatrix * localMoonMatrix;
    moonNormalMatrix = mat3(transpose(inverse(moonPointMatrix)));
}

void animateMars(float time) {
    marsPointMatrix = sunPointMatrix;
    marsPointMatrix = marsPointMatrix * rotationYMatrix(time * 0.265);
    marsPointMatrix = marsPointMatrix * translationMatrix(vec3(5.0, 0.0, 0.0));
    marsPointMatrix = marsPointMatrix * scalingMatrix(vec3(0.25));
    marsNormalMatrix = mat3(transpose(inverse(marsPointMatrix)));
}

void render() {
    mat4 pointMatrix;
    mat3 normalMatrix;
    if (gl_InstanceID == 0) {
        pointMatrix = sunPointMatrix;
        normalMatrix = sunNormalMatrix;
        vColor = vec3(1.0, 0.8, 0.2);
    } else if (gl_InstanceID == 1) {
        pointMatrix = mercuryPointMatrix;
        normalMatrix = mercuryNormalMatrix;
        vColor = vec3(0.7, 0.7, 0.7);
    } else if (gl_InstanceID == 2) {
        pointMatrix = venusPointMatrix;
        normalMatrix = venusNormalMatrix;
        vColor = vec3(0.9, 0.7, 0.3);
    } else if (gl_InstanceID == 3) {
        pointMatrix = earthPointMatrix;
        normalMatrix = earthNormalMatrix;
        vColor = vec3(0.2, 0.4, 1.0);
    } else if (gl_InstanceID == 4) {
        pointMatrix = moonPointMatrix;
        normalMatrix = moonNormalMatrix;
        vColor = vec3(0.6);
    } else {
        pointMatrix = marsPointMatrix;
        normalMatrix = marsNormalMatrix;
        vColor = vec3(0.9, 0.3, 0.1);
    }

    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * pointMatrix * vec4(position, 1.0);
}
```

# Reference Fragment Shader
```glsl
precision highp float;

in vec3 vNormal;
in vec3 vColor;
out vec4 fragColor;

void main() {
    vec3 lightDirection = normalize(vec3(0.5, 0.5, 1.0));
    float diffuse = max(dot(normalize(vNormal), lightDirection), 0.0);
    float ambient = 0.2;
    fragColor = vec4(vColor * (diffuse + ambient), 1.0);
}
```
