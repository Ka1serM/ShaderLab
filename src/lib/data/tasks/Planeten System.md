---
category: Transformation
type: 3D
title: Planeten System
shaderStages:
  - vertex
camera:
  position: [8.5, 8.5, 8.5]
  target: [0, 0, 0]
  fov: 30
modelPath: models/Sphere.glb
instanceCount: 6
---

# Task
Erstelle ein animiertes System aus **Sonne**, **Merkur**, **Venus**, **Erde**, **Mond** und **Mars**. Alle sechs Kugeln werden als Instanzen desselben Meshes gerendert.

Implementiere für jedes Objekt eine Funktion. `main` berechnet die Transformationen einmal pro Vertex. Die gemeinsamen Matrizen bilden dabei die wiederverwendbare Hierarchie.

# Hints

## Hint
Die `pointMatrix` beschreibt die vollständige Transformation eines Objekts. Die rechte Matrix wird zuerst angewendet.

## Hint
Schreibe dir eigene Hilfsfunktionen wie `mat4 translationMatrix(vec3)`, `mat4 scalingMatrix(vec3)` und `mat4 rotationYMatrix(float)`. Als Vorlage für die Schreibweise dient die ausgeschriebene Matrix in `animateSun`.

## Hint
Jeder Planet braucht eine Drehung um die Sonne und anschließend eine Translation entlang seiner Umlaufbahn: `rotationYMatrix(...) * translationMatrix(...)`.

## Hint
Der Mond ist von der Erde abhängig: `animateMoon` verwendet die bereits berechnete `earthPointMatrix` und multipliziert sie mit seiner lokalen Transformation.

## Hint
Für korrekt beleuchtete, skalierte Objekte gilt: `normalMatrix = mat3(transpose(inverse(pointMatrix)))`.

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
void renderCurrentInstance();
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
    renderCurrentInstance();
}

void animateSun(float time) {
    // Beispiel: So baust du eine Matrix von Hand auf. Schreib sie genau wie auf dem
    // Papier, Zeile fuer Zeile -- ShaderLab dreht mat4(...)/mat3(...)-Literale mit
    // allen 16 bzw. 9 Werten beim Kompilieren automatisch in die richtige Reihenfolge.
    // Ausgeschrieben ist das hier die Identitätsmatrix mat4(1.0).
    sunPointMatrix = mat4(1.0, 0.0, 0.0, 0.0,
                          0.0, 1.0, 0.0, 0.0,
                          0.0, 0.0, 1.0, 0.0,
                          0.0, 0.0, 0.0, 1.0);
    sunNormalMatrix = mat3(1.0);
    // TODO: Skaliere die Sonne. Schreibe dir dafür eine eigene Funktion
    // mat4 scalingMatrix(vec3 scaleVector) nach dem Muster oben.
}

void animateMercury(float time) {
    mercuryPointMatrix = sunPointMatrix;
    mercuryNormalMatrix = mat3(1.0);
    // TODO: Lasse Merkur die Sonne umkreisen und skaliere ihn.
}

void animateVenus(float time) {
    venusPointMatrix = sunPointMatrix;
    venusNormalMatrix = mat3(1.0);
    // TODO: Lasse Venus die Sonne umkreisen und skaliere sie.
}

void animateEarth(float time) {
    earthPointMatrix = sunPointMatrix;
    earthNormalMatrix = mat3(1.0);
    // TODO: Lasse die Erde die Sonne umkreisen und skaliere sie.
}

void animateMoon(float time) {
    moonPointMatrix = earthPointMatrix;
    moonNormalMatrix = mat3(1.0);
    // TODO: Erzeuge die lokale Mondmatrix.
}

void animateMars(float time) {
    marsPointMatrix = sunPointMatrix;
    marsNormalMatrix = mat3(1.0);
    // TODO: Lasse Mars die Sonne umkreisen und skaliere ihn.
}

// @suffix
void renderCurrentInstance() {
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

# Starter Fragment Shader
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
void renderCurrentInstance();

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
    renderCurrentInstance();
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

void renderCurrentInstance() {
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
