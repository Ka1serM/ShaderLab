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
Implementiere im Fragment-Shader die Beleuchtung nach dem **Phong-Beleuchtungsmodell**. Die Position und Normale eines Fragments werden aus dem Vertex-Shader übergeben; nutze sie, um die Lichtanteile für die Szene zu bestimmen.

1. **Ambenter Lichtanteil:** Berechne den ambienten Anteil und lege einen Reflexionskoeffizienten für das Material fest. Beurteile das Bildergebnis und korrigiere mögliche Fehler.
2. **Diffuser Lichtanteil:** Ergänze für die vorhandene Lichtquelle den diffusen Anteil. Lege einen diffusen Reflexionskoeffizienten fest und prüfe das Ergebnis in der Vorschau.
3. **Spekularer Lichtanteil:** Ergänze den spekularen Anteil. Lege dafür einen spekularen Reflexionskoeffizienten sowie die benötigte Shininess fest.
4. **Weitere Punktlichter:** Ergänze mindestens zwei weitere Punktlichter und passe die Berechnung so an, dass eine beliebige Anzahl von Punktlichtern berücksichtigt werden kann. Erzeuge eine visuell ansprechende Lichtstimmung.

Der diffuse und spekulare Anteil darf nur auf der der jeweiligen Lichtquelle zugewandten Seite entstehen. Beurteile das Bildergebnis nach jedem Schritt und behebe auftretende Fehler.

# Theory
Das lokale Phong-Beleuchtungsmodell approximiert die Reflexion mit drei Komponenten:

1. **Ambient**: Grundhelligkeit der Szene
2. **Diffuse**: Helligkeit basierend auf dem Winkel zwischen Normalen und Lichtquelle
3. **Spekular**: Glanzlicht aus dem Winkel zwischen Reflexionsvektor `R` und Blickvektor `V`

Für eine Lichtquelle lautet es `I = Ia·ka + Ip·[kd·max(N·L,0) + ks·max(V·R,0)^n]`. Die Rechnung erfolgt kanalweise für Rot, Grün und Blau; `n` ist der spekulare Exponent. Ein größeres `n` erzeugt ein kleineres, konzentrierteres Glanzlicht.

**Phong-Beleuchtung und Phong Shading sind verschiedene Begriffe.** Das Beleuchtungsmodell definiert die Reflexionsrechnung. Beim Phong Shading werden Vertexnormalen über das Polygon interpoliert, pro Fragment normalisiert und erst dann für die Beleuchtung verwendet. Dieser Fragment-Shader kombiniert beides.

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
// @prefix

// Interpolierte Weltkoordinaten und Oberflächennormale aus dem Vertex-Shader.
in vec3 vNormal;
in vec3 vPosition;

out vec4 fragColor;

// Wird von ShaderLab mit der aktuellen Kameraposition befüllt.
uniform vec3 cameraPosition;

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
    float specular = diffuse > 0.0
        ? pow(max(dot(reflectDir, viewDir), 0.0), 32.0)
        : 0.0;

    // Ambient component
    vec3 ambient = vec3(0.1);

    vec3 color = ambient + baseColor * diffuse + specular * vec3(1.0);
    fragColor = vec4(color, 1.0);
}
```
