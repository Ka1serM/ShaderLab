---
id: shading-methods
title: Shading
category: Shading
task: Phong
type: shader-controls
scene:
  objects:
    - id: shadingSpheres
      selectable: false
      source:
        type: primitive
        geometry: sphere
        segments: [16, 12]
      instances:
        count: 3
        matrices:
          - [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -2.2, 0, 0, 1]
          - [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
          - [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2.2, 0, 0, 1]
---

# Vertex Shader

```glsl
precision highp float;

in vec3 position;
in vec3 normal;
in mat4 instanceMatrix;

uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

// @control lightDir vec3 label="Lichtrichtung" default="1,1,1" visualize=vector
uniform vec3 uLightDir;
// @control shininess slider label="Shininess" min=1 max=128 step=1 default=32
uniform float uShininess;
// Wird vom Renderer bereitgestellt und enthält die Weltposition der Kamera.
uniform vec3 cameraPosition;

flat out int vShadingMode;
out vec3 vWorldPosition;
out vec3 vWorldNormal;
out vec3 vGouraudColor;

vec3 shadeGouraud(vec3 worldPosition, vec3 worldNormal) {
    vec3 n = normalize(worldNormal);
    vec3 l = normalize(uLightDir);
    vec3 v = normalize(cameraPosition - worldPosition);
    float diffuse = max(dot(n, l), 0.0);
    float specular = diffuse > 0.0
        ? pow(max(dot(reflect(-l, n), v), 0.0), uShininess)
        : 0.0;
    return vec3(0.08) + vec3(0.72, 0.38, 0.16) * diffuse + vec3(0.9) * specular;
}

void main() {
    // Die drei Kugeln desselben InstancedMesh erhalten die Modi 0, 1 und 2.
    vShadingMode = gl_InstanceID;

    mat4 instanceModelMatrix = modelMatrix * instanceMatrix;
    vec4 worldPosition = instanceModelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(transpose(inverse(instanceModelMatrix))) * normal);

    // Gouraud: Beleuchtung genau einmal je Vertex auswerten.
    vGouraudColor = shadeGouraud(vWorldPosition, vWorldNormal);

    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
```

# Fragment Shader

```glsl
precision highp float;

flat in int vShadingMode;
in vec3 vWorldPosition;
in vec3 vWorldNormal;
in vec3 vGouraudColor;

uniform vec3 cameraPosition;
uniform vec3 uLightDir;
uniform float uShininess;

out vec4 fragColor;

vec3 shadeIllumination(vec3 worldPosition, vec3 worldNormal) {
    vec3 n = normalize(worldNormal);
    vec3 l = normalize(uLightDir);
    vec3 v = normalize(cameraPosition - worldPosition);
    float diffuse = max(dot(n, l), 0.0);
    float specular = diffuse > 0.0
        ? pow(max(dot(reflect(-l, n), v), 0.0), uShininess)
        : 0.0;
    return vec3(0.08) + vec3(0.72, 0.38, 0.16) * diffuse + vec3(0.9) * specular;
}

vec3 shadeFlat() {
    // Ableitungen der Fragmentposition liefern die geometrische Face-Normale.
    vec3 faceNormal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
    if (!gl_FrontFacing) faceNormal = -faceNormal;
    return shadeIllumination(vWorldPosition, faceNormal);
}

void main() {
    if (vShadingMode == 0) {
        fragColor = vec4(shadeFlat(), 1.0);
    } else if (vShadingMode == 1) {
        // Bereits am Vertex berechnet; der Rasterizer interpoliert nur die Farbe.
        fragColor = vec4(vGouraudColor, 1.0);
    } else {
        // Normalen und Positionen interpolieren, Beleuchtung pro Fragment berechnen.
        fragColor = vec4(shadeIllumination(vWorldPosition, vWorldNormal), 1.0);
    }
}
```

# Overview

Von links nach rechts zeigen die drei Instanzen **Flat**, **Gouraud** und **Illumination pro Fragment**. Alle verwenden dieselbe Kugelgeometrie, Materialfarbe und Lichtquelle; nur der Zeitpunkt der Beleuchtungsberechnung ändert sich. Verändere Lichtrichtung und Shininess und achte besonders auf das Glanzlicht.

# Explanation

Beim **Flat Shading** nutzt jedes Dreieck seine geometrische Face-Normale. Deshalb besitzt ein Dreieck einen einheitlichen Farbwert und die Facetten bleiben sichtbar.

Beim **Gouraud Shading** wird die Beleuchtung im Vertex Shader berechnet. Die resultierenden Farben werden innerhalb des Dreiecks interpoliert. Das ist effizient, kann aber kleine oder zwischen den Vertices liegende Glanzlichter übersehen.

Bei **Illumination pro Fragment** werden Normalen und Positionen interpoliert; erst im Fragment Shader wird beleuchtet. Dadurch bleiben Glanzlichter genauer und die Oberfläche wirkt glatter.

Die drei Kugeln sind Instanzen eines einzigen Meshes. `gl_InstanceID` wählt dabei `0 = Flat`, `1 = Gouraud` und `2 = Illumination pro Fragment`.
