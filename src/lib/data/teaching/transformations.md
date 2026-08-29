---
id: transformations
title: Transformationen
category: Transformationen
task: Lambert
type: shader-controls
overlays:
  transformControls:
    mode: translate
scene:
  objects:
    - id: transformObject
      selectable: true
      source:
        type: primitive
        geometry: box
---

# Vertex Shader

```glsl
// @prefix
precision highp float;

in vec3 position;
in vec3 normal;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

out float vLightIntensity;
// @prefix

// @control translationMatrix matrix label="Translation T" default="1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1"
uniform mat4 uTranslationMatrix;
// @control rotationMatrix matrix label="Rotation R" default="1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1"
uniform mat4 uRotationMatrix;
// @control scaleMatrix matrix label="Scale S" default="1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1"
uniform mat4 uScaleMatrix;

void main() {
    // @readback pointMatrix matrix label="Punktmatrix (T · R · S)" default="1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1"
    mat4 pointMatrix = uTranslationMatrix * uRotationMatrix * uScaleMatrix;
    mat3 normalMatrix = mat3(transpose(inverse(pointMatrix)));
    vec3 transformedNormal = normalize(normalMatrix * normal);
    vec3 lightDirection = normalize(vec3(1.0, 0.5, 1.0));
    vLightIntensity = 0.6 + max(dot(transformedNormal, lightDirection), 0.0);

    gl_Position = projectionMatrix * modelViewMatrix * pointMatrix * vec4(position, 1.0);
}
```

# Fragment Shader

```glsl
precision highp float;

in float vLightIntensity;
out vec4 fragColor;

void main() {
    vec3 baseColor = vec3(0.8, 0.4, 0.2);
    fragColor = vec4(baseColor * vLightIntensity, 1.0);
}
```

# Overview

Verändere Translation, Rotation und Skalierung und beobachte ihre kombinierte Wirkung auf das Objekt.

# Explanation

Translation lässt sich zusammen mit Rotation und Skalierung durch Matrizen ausdrücken, weil Punkte in homogenen Koordinaten `(x,y,z,w)` dargestellt werden. Für Punkte gilt `w = 1`, für Richtungsvektoren `w = 0`.

Matrixmultiplikation ist nicht kommutativ. Die Punktmatrix lautet hier `M = T · R · S`; bei Spaltenvektoren wirkt deshalb zuerst `S`, danach `R` und zuletzt `T`. Die nur lesbare Matrix wird direkt aus dem Shader ausgelesen. Normalen müssen bei nicht-uniformer Skalierung mit der invers transponierten Matrix `transpose(inverse(M))` transformiert werden.
