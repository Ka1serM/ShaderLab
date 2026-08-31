---
category: Transformation
type: 3D
title: Zahnräder
shaderStages:
  - vertex
camera:
  position: [5.0, 5.0, 5.0]
  target: [0, 1.8, 0]
  fov: 30
modelPath: models/Gear.glb
instanceCount: 3
---

# Task
Implementiere zeitabhängige Transformationen für ein System aus drei Zahnrädern. In jedem Frame werden `animateA(time)`, `animateB(time)` und `animateC(time)` aufgerufen. Jede Funktion muss eine gültige Punkt- und Normalenmatrix für ihr Zahnrad erzeugen.

1. **Zahnrad A animieren:** Drehe Zahnrad A um seine Achse, zum Beispiel mit einer zehntel Umdrehung pro Sekunde. Stelle sicher, dass die Beleuchtung korrekt berechnet wird.
2. **Zahnrad B animieren:** Drehe Zahnrad B um seine Achse und positioniere es so, dass es korrekt in Zahnrad A greift. Stelle sicher, dass die Beleuchtung korrekt berechnet wird.
3. **Zahnrad C animieren:** Drehe und positioniere Zahnrad C so, dass es korrekt in Zahnrad B greift und genauso dick ist wie die anderen Zahnräder. Stelle sicher, dass die Beleuchtung korrekt berechnet wird.

`main()` bereitet alle drei Transformationen vor. Die Punktmatrix beschreibt die vollständige Transformation, und die Normalenmatrix muss dazu passend berechnet werden.

# Hints

## Hint
Zahnrad B muss gegenläufig rotieren. Für ineinandergreifende Räder hängt die Winkelgeschwindigkeit vom Verhältnis ihrer Radien ab.

# Theory
Eine `pointMatrix` beschreibt die Transformation von Punkten. Für Normalen wird die inverse Transponierte der Punktmatrix verwendet. Das ist besonders bei nicht-uniformer Skalierung wichtig.

Die drei Zahnräder werden gemeinsam in der Vorschau gerendert. Jede Animationsfunktion bestimmt dabei ausschließlich die Transformation ihres eigenen Zahnrads.

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

void animateA(float time);
void animateB(float time);
void animateC(float time);
void render();
// @prefix

mat4 gearAPointMatrix;
mat4 gearBPointMatrix;
mat4 gearCPointMatrix;
mat3 gearANormalMatrix;
mat3 gearBNormalMatrix;
mat3 gearCNormalMatrix;

void main() {
    animateA(time);
    animateB(time);
    animateC(time);
    render();
}

void animateA(float time) {
    gearAPointMatrix = mat4(1.0, 0.0, 0.0, 0.0,
                            0.0, 1.0, 0.0, 0.0,
                            0.0, 0.0, 1.0, 0.0,
                            0.0, 0.0, 0.0, 1.0);
    gearANormalMatrix = mat3(1.0);
}

void animateB(float time) {
    gearBPointMatrix = mat4(1.0);
    gearBNormalMatrix = mat3(1.0);
}

void animateC(float time) {
    gearCPointMatrix = mat4(1.0);
    gearCNormalMatrix = mat3(1.0);
}

// @suffix
void render() {
    mat4 pointMatrix;
    mat3 normalMatrix;
    if (gl_InstanceID == 0) {
        pointMatrix = gearAPointMatrix;
        normalMatrix = gearANormalMatrix;
        vColor = vec3(1.0, 0.4, 0.2);
    } else if (gl_InstanceID == 1) {
        pointMatrix = gearBPointMatrix;
        normalMatrix = gearBNormalMatrix;
        vColor = vec3(0.2, 0.6, 1.0);
    } else {
        pointMatrix = gearCPointMatrix;
        normalMatrix = gearCNormalMatrix;
        vColor = vec3(0.7, 0.8, 0.2);
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
    vec3 lightDirection = normalize(vec3(1.0, 0.5, 1.0));
    float diffuse = max(dot(normalize(vNormal), lightDirection), 0.0);
    float ambient = 0.3;
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

mat4 gearAPointMatrix;
mat4 gearBPointMatrix;
mat4 gearCPointMatrix;
mat3 gearANormalMatrix;
mat3 gearBNormalMatrix;
mat3 gearCNormalMatrix;

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

mat4 rotationXMatrix(float rotationAngle) {
    float cosine = cos(rotationAngle);
    float sine = sin(rotationAngle);
    return mat4(1.0, 0.0, 0.0, 0.0,
                0.0, cosine, sine, 0.0,
                0.0, -sine, cosine, 0.0,
                0.0, 0.0, 0.0, 1.0);
}

void animateA(float time) {
    gearAPointMatrix = mat4(1.0);
    gearAPointMatrix = gearAPointMatrix * translationMatrix(vec3(0.0, 0.0, 0.0));
    gearAPointMatrix = gearAPointMatrix * rotationXMatrix(time * 0.8);
    gearAPointMatrix = gearAPointMatrix * scalingMatrix(vec3(1.0, 1.0, 1.0));
    gearANormalMatrix = mat3(transpose(inverse(gearAPointMatrix)));
}

void animateB(float time) {
    gearBPointMatrix = mat4(1.0);
    gearBPointMatrix = gearBPointMatrix * translationMatrix(vec3(0.0, 2.0, 0.0));
    gearBPointMatrix = gearBPointMatrix * rotationXMatrix(-time * 1.6);
    gearBPointMatrix = gearBPointMatrix * scalingMatrix(vec3(1.0, 0.65, 0.65));
    gearBNormalMatrix = mat3(transpose(inverse(gearBPointMatrix)));
}

void animateC(float time) {
    gearCPointMatrix = mat4(1.0);
    gearCPointMatrix = gearCPointMatrix * translationMatrix(vec3(0.0, 3.85, 0.0));
    gearCPointMatrix = gearCPointMatrix * rotationXMatrix(time * 1.05 + 0.261799);
    gearCPointMatrix = gearCPointMatrix * scalingMatrix(vec3(1.0, 0.85, 0.85));
    gearCNormalMatrix = mat3(transpose(inverse(gearCPointMatrix)));
}

void main() {
    animateA(time);
    animateB(time);
    animateC(time);

    mat4 pointMatrix;
    mat3 normalMatrix;
    if (gl_InstanceID == 0) {
        pointMatrix = gearAPointMatrix;
        normalMatrix = gearANormalMatrix;
        vColor = vec3(1.0, 0.4, 0.2);
    } else if (gl_InstanceID == 1) {
        pointMatrix = gearBPointMatrix;
        normalMatrix = gearBNormalMatrix;
        vColor = vec3(0.2, 0.6, 1.0);
    } else {
        pointMatrix = gearCPointMatrix;
        normalMatrix = gearCNormalMatrix;
        vColor = vec3(0.7, 0.8, 0.2);
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
    vec3 lightDirection = normalize(vec3(1.0, 0.5, 1.0));
    float diffuse = max(dot(normalize(vNormal), lightDirection), 0.0);
    float ambient = 0.3;
    fragColor = vec4(vColor * (diffuse + ambient), 1.0);
}
```
