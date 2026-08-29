---
id: projection
title: Projektion
category: Transformationen
task: Lambert
type: shader-controls
scene:
  objects:
    - id: viewFrustum
      source:
        type: primitive
        geometry: box-wireframe
---

# Vertex Shader

```glsl
// @prefix
precision highp float;

in vec3 position;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

out vec3 vLocalPosition;
// @prefix

// @control near slider label="Near n" min=-2 max=-0.1 step=0.05 default=-1
uniform float uNear;
// @control far slider label="Far f" min=-10 max=-2.5 step=0.1 default=-6
uniform float uFar;
// @control left slider label="Left l" min=-3 max=-0.1 step=0.05 default=-1
uniform float uLeft;
// @control right slider label="Right r" min=0.1 max=3 step=0.05 default=1
uniform float uRight;
// @control bottom slider label="Bottom b" min=-3 max=-0.1 step=0.05 default=-0.75
uniform float uBottom;
// @control top slider label="Top t" min=0.1 max=3 step=0.05 default=0.75
uniform float uTop;

void main() {
    // Exakt die für die Papieraufgabe angegebene Matrix. ShaderLab lässt
    // Matrixliterale zeilenweise notieren und konvertiert sie für GLSL.
    // @readback projectionMatrix matrix label="Projektionsmatrix P" default="1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1"
    mat4 teachingProjectionMatrix = mat4(
        2.0 * uNear / (uRight - uLeft), 0.0,
        (uRight + uLeft) / (uRight - uLeft), 0.0,
        0.0, 2.0 * uNear / (uTop - uBottom),
        (uBottom + uTop) / (uTop - uBottom), 0.0,
        0.0, 0.0, -(uFar + uNear) / (uFar - uNear),
        (2.0 * uFar * uNear) / (uFar - uNear),
        0.0, 0.0, 1.0, 0.0
    );

    // A box spans [-0.5, 0.5]. Map it to the NDC cube [-1, 1], then apply
    // P^-1 and divide by w. Its eight corners become the frustum corners.
    vec4 frustumPosition = inverse(teachingProjectionMatrix) * vec4(position * 2.0, 1.0);
    frustumPosition /= frustumPosition.w;
    vLocalPosition = position;

    // The viewport's own camera lets us inspect the constructed frustum.
    gl_Position = projectionMatrix * modelViewMatrix * vec4(frustumPosition.xyz, 1.0);
}
```

# Fragment Shader

```glsl
precision highp float;

in vec3 vLocalPosition;
out vec4 fragColor;

void main() {
    vec3 nearColor = vec3(0.75, 0.15, 0.2);
    vec3 farColor = vec3(1.0, 0.65, 0.25);
    float depth = vLocalPosition.z + 0.5;
    fragColor = vec4(mix(nearColor, farColor, depth), 1.0);
}
```

# Overview

Verändere die sechs Grenzen `l`, `r`, `b`, `t`, `n` und `f` des Sichtvolumens. Der Einheitswürfel wird zum zugehörigen Sichtfrustum; die Matrixanzeige zeigt parallel dazu dieselbe Projektionsmatrix wie der Shader.

# Explanation

Die Ausgangswerte entsprechen exakt der Projektionsübung: `n = -1`, `f = -6`, `l = -1`, `r = 1`, `b = -0,75` und `t = 0,75`. Damit besitzt die Nearplane das Seitenverhältnis `4:3`; in der Draufsicht ergibt sich ein Öffnungswinkel von `90°`.

Wie auf dem Übungsblatt sind `n` und `f` hier die vorzeichenbehafteten z-Koordinaten der beiden Ebenen. Außerdem wird absichtlich die dort angegebene, gegenüber der Vorlesung abgewandelte Papiermatrix verwendet. Nach der Matrixmultiplikation gilt deshalb `w = z`.

Erst die anschließende Division durch `w` erzeugt die perspektivische Verkürzung. Genau wie in Aufgabe 1 werden die Frustumecken zunächst mit `P` multipliziert und danach homogenisiert. Für die Visualisierung wird dieser Weg umgekehrt: `P⁻¹` transformiert den Einheitswürfel zurück in das Sichtfrustum.
