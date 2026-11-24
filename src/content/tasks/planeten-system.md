---
category: Transformation
title: Planeten System
showTimeControl: true
shaderStages:
  - vertex
camera:
  position: [0.0, 5.5, 4.2]
  target: [0, 0, 0]
  fov: 30
scenes:
  - frameBox: [[-3.2, -1.0, -3.2], [3.2, 1.0, 3.2]]
    objects:
      - source: models/Sphere.glb
        instanceCount: 8
---

# Task
Erstelle einen Szenengraphen samt Transformationen für ein animiertes Planetensystem. Zu Beginn enthält der Szenengraph nur die Sonne. Die übrigen Shapes werden erst gerendert, wenn ein Szenenknoten sie enthält.

| Körper | Radius | Bahn&shy;radius | Eigen&shy;rotation | Umlauf | Achs&shy;neigung | Bahn&shy;neigung |
| --- | --- | --- | --- | --- | --- | --- |
| Merkur | 5 | 76 | 58,7 | 88 | 0° | 7° |
| Venus | 12 | 145 | 243 | 224,7 | 177° | 3° |
| Erde | 13 | 200 | 1 | 365,2 | 23° | 0° |
| Mars | 7 | 305 | 1 | 687 | 25° | 2° |
| Mond (Erde) | 3,5 | 22 | 27,3 | 27,3 | 7° | 5° |
| Phobos (Mars) | 2,5 | 15 | 0,3 | 0,3 | 0° | 1° |
| Deimos (Mars) | 1,5 | 20 | 1,3 | 1,3 | 0° | 1° |

Zeiten in Tagen. Die Shapes heißen `MERCURY_SHAPE`, `VENUS_SHAPE`, …, `DEIMOS_SHAPE`. Alle außer der Sonne sind Einheitskugeln im Ursprung.

1. **Szenengraph zeichnen:** Skizziere einen Szenengraphen, der die Konstellation des Planetensystems mit seinen Transformationen wiedergibt. Vergiss die Wurzel nicht.
2. **Erde auf Umlaufbahn:** Lege in `SCENE` einen Knoten für die Erde als Kind der Sonne an und schreibe eine Animator-Funktion, die die Erde in der richtigen Größe um die eigene Achse und auf ihrer Umlaufbahn um die Sonne bewegt. Trage sie in `animate(...)` ein. Passe `TIME_SCALE` an, falls die Eigenrotation nicht gut zu sehen ist.
3. **Szenengraph / Hierarchische Transformation:** Setze den Szenengraphen aus Aufgabe 1 um. Jeder Knoten implementiert dabei nur einen einzelnen Transformationsschritt. Schreibe für jeden Schritt eine Transformationsfunktion, die ein Paar aus Punkt- und Normalenmatrix liefert, und verwende sie in den Animator-Funktionen. Ergänze `nodeTransform(...)`, sodass es die Transformationen aller Elternknoten bis zur Wurzel einbezieht.
4. **Mond auf Umlaufbahn:** Füge den Mond hinzu, sodass er korrekt um die Erde kreist. Die Transformationen der Kindknoten dürfen sich nicht gegenseitig beeinflussen.
5. **Verbleibende Planeten und Monde:** Füge Merkur, Venus, Mars, Phobos und Deimos hinzu.

Zusatzaufgaben: Bahnneigungen, Achsneigungen und Jahreszeiten als eigene Szenenknoten.

# Hints

## Hint
Ein Knoten kann reiner Transformationsknoten sein (`shape` = `NONE`). Hängt der Mond an einem solchen Knoten der Erde statt an ihrer Shape, wirken Eigenrotation und Größe der Erde nicht auf ihn.

## Hint
In `nodeTransform(...)` kennst du von jedem Knoten nur den Elternknoten: `SCENE[node].parent`. Laufe in einer Schleife bis `NONE` und multipliziere die Matrix des Elternknotens jeweils von links.

## Hint
Für Normalen gilt: Eine Verschiebung ändert sie nicht, eine Rotation bleibt dieselbe Rotation, eine Skalierung mit $s$ wird zur Skalierung mit $1/s$.

# Theory
Ein Szenenknoten besteht wie im Praktikum aus einer zeitabhängigen Transformation (Animator-Funktion), optional einer Shape und seiner Stellung im Graphen. Die Animator-Funktion liefert ein Paar aus **Punktmatrix** und **Normalenmatrix**.

| JavaScript-Praktikum | GLSL |
| --- | --- |
| `{ animator, shape, children }` | `Node(parent, shape)` in `SCENE`, Animator über `animate(node, time)` |
| `children: [earth, moon]` | Kinder verweisen auf ihren Elternknoten |
| rekursives `renderNode(...)` mit `clone()` | Schleife in `nodeTransform(...)` von der Shape zur Wurzel |
| `renderSceneNode(...)` | Black Box: rendert jede Shape mit den Matrizen ihres Knotens |

GLSL kennt keine Rekursion und keine Objekte. Statt der Liste der Kinder speichert jeder Knoten deshalb seinen Elternknoten, und die Gesamttransformation entsteht, indem man vom Knoten bis zur Wurzel läuft: $M = M_\text{Wurzel} \cdots M_\text{Eltern} \cdot M_\text{Knoten}$. Die rechte Matrix wird zuerst angewendet. Geschwister teilen sich nur ihre gemeinsamen Vorfahren, genau wie die geklonten Matrizen im rekursiven Durchlauf.

Die Szene wird von der Sonne im Ursprung beleuchtet. Ein dunkler Streifen auf jedem Planeten macht ihre Eigenrotation sichtbar.

# Starter Vertex Shader
```glsl
// @prefix
in vec3 position;
in vec3 normal;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float time;

out vec3 vNormal;
out vec3 vWorldPosition;
out vec3 vLocalPosition;
out vec3 vColor;
flat out int vEmissive;

const int NONE = -1;

// Shapes der Black Box: je eine Einheitskugel im Ursprung, die Sonne bereits in
// ihrer richtigen Groesse (wie CreateSun(), CreateEarth(), ...).
const int SUN_SHAPE = 0;
const int MERCURY_SHAPE = 1;
const int VENUS_SHAPE = 2;
const int EARTH_SHAPE = 3;
const int MARS_SHAPE = 4;
const int MOON_SHAPE = 5;
const int PHOBOS_SHAPE = 6;
const int DEIMOS_SHAPE = 7;

// Transformation eines Szenenknotens: Matrix fuer Punkte und Matrix fuer Normalen.
struct Transform {
    mat4 pointMatrix;
    mat4 normalMatrix;
};

// Szenenknoten: Elternknoten (NONE = Wurzel) und Shape (NONE = reiner
// Transformationsknoten). Die Animator-Funktion eines Knotens waehlt animate(...).
struct Node {
    int parent;
    int shape;
};

Transform identityTransform() {
    return Transform(mat4(1.0), mat4(1.0));
}
// @prefix

// Zeitraffer: Tage pro Sekunde
const float TIME_SCALE = 3.0;

////////////////////////////////////////////////////////////////////////////////
// Transformationsfunktionen
////////////////////////////////////////////////////////////////////////////////

// TODO: Hier werden Sie grundlegende Transformationsfunktionen implementieren.

////////////////////////////////////////////////////////////////////////////////
// Szenengraph
////////////////////////////////////////////////////////////////////////////////

// Knotennummern
const int SUN = 0;

const int NODE_COUNT = 1;
const Node SCENE[NODE_COUNT] = Node[NODE_COUNT](
    //   Elternknoten  Shape
    Node(NONE,         SUN_SHAPE)   // SUN
);

////////////////////////////////////////////////////////////////////////////////
// Animator-Funktionen
////////////////////////////////////////////////////////////////////////////////

Transform animateSun(float time) {
    return Transform(
        mat4(1.0, 0.0, 0.0, 0.0,
             0.0, 1.0, 0.0, 0.0,
             0.0, 0.0, 1.0, 0.0,
             0.0, 0.0, 0.0, 1.0),
        mat4(1.0, 0.0, 0.0, 0.0,
             0.0, 1.0, 0.0, 0.0,
             0.0, 0.0, 1.0, 0.0,
             0.0, 0.0, 0.0, 1.0)
    );
}

// TODO: Hier werden Sie weitere Animator-Funktionen implementieren.

// Waehlt die Animator-Funktion eines Szenenknotens.
Transform animate(int node, float time) {
    switch (node) {
        case SUN: return animateSun(time);
    }
    return identityTransform();
}

////////////////////////////////////////////////////////////////////////////////
// nodeTransform(node, time)
// Wird fuer jede Shape aufgerufen und liefert die Transformationsmatrizen, mit
// denen ihr Szenenknoten gerendert wird.
////////////////////////////////////////////////////////////////////////////////
Transform nodeTransform(int node, float time) {
    return animate(node, time);
}

// @suffix
// Szenenkoordinaten (Tabellenwerte) auf Bildschirmeinheiten
const float SCENE_UNIT = 0.01;
const float SUN_RADIUS = 40.0;

const vec3 SHAPE_COLORS[8] = vec3[8](
    vec3(1.0, 0.78, 0.25),
    vec3(0.62, 0.6, 0.58),
    vec3(0.92, 0.8, 0.55),
    vec3(0.22, 0.45, 0.95),
    vec3(0.85, 0.35, 0.18),
    vec3(0.75, 0.75, 0.75),
    vec3(0.6, 0.52, 0.45),
    vec3(0.68, 0.6, 0.52)
);

// renderSceneNode(...) der Black Box: Jede Instanz ist eine Shape. Gerendert
// wird sie mit den Matrizen des Szenenknotens, der sie enthaelt.
void main() {
    int shapeNode = NONE;
    for (int node = 0; node < NODE_COUNT; node++) {
        if (SCENE[node].shape == gl_InstanceID) shapeNode = node;
    }
    if (shapeNode == NONE) {
        // Shape ist (noch) nicht im Szenengraphen
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        return;
    }

    Transform transform = nodeTransform(shapeNode, time * TIME_SCALE);
    float shapeSize = gl_InstanceID == SUN_SHAPE ? SUN_RADIUS : 1.0;

    vec4 worldPosition = transform.pointMatrix * vec4(position * shapeSize, 1.0);
    vWorldPosition = worldPosition.xyz * SCENE_UNIT;
    vNormal = normalize(mat3(transform.normalMatrix) * normal);
    vLocalPosition = position;
    vColor = SHAPE_COLORS[gl_InstanceID];
    vEmissive = gl_InstanceID == SUN_SHAPE ? 1 : 0;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(vWorldPosition, 1.0);
}
// @suffix
```

# Reference Vertex Shader
```glsl
in vec3 position;
in vec3 normal;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float time;

out vec3 vNormal;
out vec3 vWorldPosition;
out vec3 vLocalPosition;
out vec3 vColor;
flat out int vEmissive;

const int NONE = -1;

// Shapes der Black Box: je eine Einheitskugel im Ursprung, die Sonne bereits in
// ihrer richtigen Groesse (wie CreateSun(), CreateEarth(), ...).
const int SUN_SHAPE = 0;
const int MERCURY_SHAPE = 1;
const int VENUS_SHAPE = 2;
const int EARTH_SHAPE = 3;
const int MARS_SHAPE = 4;
const int MOON_SHAPE = 5;
const int PHOBOS_SHAPE = 6;
const int DEIMOS_SHAPE = 7;

// Transformation eines Szenenknotens: Matrix fuer Punkte und Matrix fuer Normalen.
struct Transform {
    mat4 pointMatrix;
    mat4 normalMatrix;
};

// Szenenknoten: Elternknoten (NONE = Wurzel) und Shape (NONE = reiner
// Transformationsknoten). Die Animator-Funktion eines Knotens waehlt animate(...).
struct Node {
    int parent;
    int shape;
};

Transform identityTransform() {
    return Transform(mat4(1.0), mat4(1.0));
}

// Zeitraffer: Tage pro Sekunde
const float TIME_SCALE = 3.0;

////////////////////////////////////////////////////////////////////////////////
// Transformationsfunktionen
// Je ein Transformationsschritt als Paar aus Punkt- und Normalenmatrix.
////////////////////////////////////////////////////////////////////////////////

Transform translation(vec3 offset) {
    return Transform(
        mat4(1.0, 0.0, 0.0, offset.x,
             0.0, 1.0, 0.0, offset.y,
             0.0, 0.0, 1.0, offset.z,
             0.0, 0.0, 0.0, 1.0),
        // Normalen sind Richtungen: Eine Verschiebung aendert sie nicht.
        mat4(1.0)
    );
}

Transform scaling(float factor) {
    return Transform(
        mat4(factor, 0.0,    0.0,    0.0,
             0.0,    factor, 0.0,    0.0,
             0.0,    0.0,    factor, 0.0,
             0.0,    0.0,    0.0,    1.0),
        // Inverse Transponierte der Skalierung
        mat4(1.0 / factor, 0.0,          0.0,          0.0,
             0.0,          1.0 / factor, 0.0,          0.0,
             0.0,          0.0,          1.0 / factor, 0.0,
             0.0,          0.0,          0.0,          1.0)
    );
}

// Drehung um die y-Achse, eine volle Umdrehung pro Periode (in Tagen).
Transform rotationY(float period, float time) {
    float angle = 2.0 * 3.14159265 * time / period;
    float c = cos(angle);
    float s = sin(angle);
    mat4 rotation = mat4(  c, 0.0,   s, 0.0,
                         0.0, 1.0, 0.0, 0.0,
                          -s, 0.0,   c, 0.0,
                         0.0, 0.0, 0.0, 1.0);
    // Die inverse Transponierte einer Rotation ist die Rotation selbst.
    return Transform(rotation, rotation);
}

////////////////////////////////////////////////////////////////////////////////
// Szenengraph
// Jeder Knoten fuehrt genau einen Transformationsschritt aus. Bahn und Position
// sind reine Transformationsknoten; Monde haengen an der Position des Planeten,
// nicht an seiner Eigenrotation oder Groesse.
////////////////////////////////////////////////////////////////////////////////

// Knotennummern
const int SUN = 0;
const int MERCURY_ORBIT = 1, MERCURY_POSITION = 2, MERCURY_SPIN = 3, MERCURY = 4;
const int VENUS_ORBIT = 5, VENUS_POSITION = 6, VENUS_SPIN = 7, VENUS = 8;
const int EARTH_ORBIT = 9, EARTH_POSITION = 10, EARTH_SPIN = 11, EARTH = 12;
const int MOON_ORBIT = 13, MOON_POSITION = 14, MOON_SPIN = 15, MOON = 16;
const int MARS_ORBIT = 17, MARS_POSITION = 18, MARS_SPIN = 19, MARS = 20;
const int PHOBOS_ORBIT = 21, PHOBOS_POSITION = 22, PHOBOS_SPIN = 23, PHOBOS = 24;
const int DEIMOS_ORBIT = 25, DEIMOS_POSITION = 26, DEIMOS_SPIN = 27, DEIMOS = 28;

const int NODE_COUNT = 29;
const Node SCENE[NODE_COUNT] = Node[NODE_COUNT](
    //   Elternknoten      Shape
    Node(NONE,             SUN_SHAPE),      // SUN

    Node(SUN,              NONE),           // MERCURY_ORBIT
    Node(MERCURY_ORBIT,    NONE),           // MERCURY_POSITION
    Node(MERCURY_POSITION, NONE),           // MERCURY_SPIN
    Node(MERCURY_SPIN,     MERCURY_SHAPE),  // MERCURY

    Node(SUN,              NONE),           // VENUS_ORBIT
    Node(VENUS_ORBIT,      NONE),           // VENUS_POSITION
    Node(VENUS_POSITION,   NONE),           // VENUS_SPIN
    Node(VENUS_SPIN,       VENUS_SHAPE),    // VENUS

    Node(SUN,              NONE),           // EARTH_ORBIT
    Node(EARTH_ORBIT,      NONE),           // EARTH_POSITION
    Node(EARTH_POSITION,   NONE),           // EARTH_SPIN
    Node(EARTH_SPIN,       EARTH_SHAPE),    // EARTH

    Node(EARTH_POSITION,   NONE),           // MOON_ORBIT
    Node(MOON_ORBIT,       NONE),           // MOON_POSITION
    Node(MOON_POSITION,    NONE),           // MOON_SPIN
    Node(MOON_SPIN,        MOON_SHAPE),     // MOON

    Node(SUN,              NONE),           // MARS_ORBIT
    Node(MARS_ORBIT,       NONE),           // MARS_POSITION
    Node(MARS_POSITION,    NONE),           // MARS_SPIN
    Node(MARS_SPIN,        MARS_SHAPE),     // MARS

    Node(MARS_POSITION,    NONE),           // PHOBOS_ORBIT
    Node(PHOBOS_ORBIT,     NONE),           // PHOBOS_POSITION
    Node(PHOBOS_POSITION,  NONE),           // PHOBOS_SPIN
    Node(PHOBOS_SPIN,      PHOBOS_SHAPE),   // PHOBOS

    Node(MARS_POSITION,    NONE),           // DEIMOS_ORBIT
    Node(DEIMOS_ORBIT,     NONE),           // DEIMOS_POSITION
    Node(DEIMOS_POSITION,  NONE),           // DEIMOS_SPIN
    Node(DEIMOS_SPIN,      DEIMOS_SHAPE)    // DEIMOS
);

////////////////////////////////////////////////////////////////////////////////
// Animator-Funktionen
// Werte aus der Tabelle: Radius, Bahnradius, Eigenumdrehungszeit, Umlaufzeit.
////////////////////////////////////////////////////////////////////////////////

Transform animate(int node, float time) {
    switch (node) {
        case MERCURY_ORBIT:    return rotationY(88.0, time);
        case MERCURY_POSITION: return translation(vec3(76.0, 0.0, 0.0));
        case MERCURY_SPIN:     return rotationY(58.7, time);
        case MERCURY:          return scaling(5.0);

        case VENUS_ORBIT:      return rotationY(224.7, time);
        case VENUS_POSITION:   return translation(vec3(145.0, 0.0, 0.0));
        case VENUS_SPIN:       return rotationY(243.0, time);
        case VENUS:            return scaling(12.0);

        case EARTH_ORBIT:      return rotationY(365.2, time);
        case EARTH_POSITION:   return translation(vec3(200.0, 0.0, 0.0));
        case EARTH_SPIN:       return rotationY(1.0, time);
        case EARTH:            return scaling(13.0);

        case MOON_ORBIT:       return rotationY(27.3, time);
        case MOON_POSITION:    return translation(vec3(22.0, 0.0, 0.0));
        case MOON_SPIN:        return rotationY(27.3, time);
        case MOON:             return scaling(3.5);

        case MARS_ORBIT:       return rotationY(687.0, time);
        case MARS_POSITION:    return translation(vec3(305.0, 0.0, 0.0));
        case MARS_SPIN:        return rotationY(1.0, time);
        case MARS:             return scaling(7.0);

        case PHOBOS_ORBIT:     return rotationY(0.3, time);
        case PHOBOS_POSITION:  return translation(vec3(15.0, 0.0, 0.0));
        case PHOBOS_SPIN:      return rotationY(0.3, time);
        case PHOBOS:           return scaling(2.5);

        case DEIMOS_ORBIT:     return rotationY(1.3, time);
        case DEIMOS_POSITION:  return translation(vec3(20.0, 0.0, 0.0));
        case DEIMOS_SPIN:      return rotationY(1.3, time);
        case DEIMOS:           return scaling(1.5);
    }
    return identityTransform();
}

////////////////////////////////////////////////////////////////////////////////
// nodeTransform(node, time)
// Gegenstueck zum rekursiven renderNode(...): GLSL kennt keine Rekursion, daher
// laeuft die Schleife vom Knoten der Shape ueber seine Elternknoten zur Wurzel.
// Jeder Elternknoten wird von links multipliziert, die Wurzel also zuletzt.
// Geschwister teilen sich nur die gemeinsamen Vorfahren und beeinflussen sich
// deshalb nicht.
////////////////////////////////////////////////////////////////////////////////
Transform nodeTransform(int node, float time) {
    Transform result = identityTransform();
    for (int step = 0; step < NODE_COUNT && node != NONE; step++) {
        Transform local = animate(node, time);
        result.pointMatrix = local.pointMatrix * result.pointMatrix;
        result.normalMatrix = local.normalMatrix * result.normalMatrix;
        node = SCENE[node].parent;
    }
    return result;
}

// Szenenkoordinaten (Tabellenwerte) auf Bildschirmeinheiten
const float SCENE_UNIT = 0.01;
const float SUN_RADIUS = 40.0;

const vec3 SHAPE_COLORS[8] = vec3[8](
    vec3(1.0, 0.78, 0.25),
    vec3(0.62, 0.6, 0.58),
    vec3(0.92, 0.8, 0.55),
    vec3(0.22, 0.45, 0.95),
    vec3(0.85, 0.35, 0.18),
    vec3(0.75, 0.75, 0.75),
    vec3(0.6, 0.52, 0.45),
    vec3(0.68, 0.6, 0.52)
);

// renderSceneNode(...) der Black Box: Jede Instanz ist eine Shape. Gerendert
// wird sie mit den Matrizen des Szenenknotens, der sie enthaelt.
void main() {
    int shapeNode = NONE;
    for (int node = 0; node < NODE_COUNT; node++) {
        if (SCENE[node].shape == gl_InstanceID) shapeNode = node;
    }
    if (shapeNode == NONE) {
        // Shape ist (noch) nicht im Szenengraphen
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        return;
    }

    Transform transform = nodeTransform(shapeNode, time * TIME_SCALE);
    float shapeSize = gl_InstanceID == SUN_SHAPE ? SUN_RADIUS : 1.0;

    vec4 worldPosition = transform.pointMatrix * vec4(position * shapeSize, 1.0);
    vWorldPosition = worldPosition.xyz * SCENE_UNIT;
    vNormal = normalize(mat3(transform.normalMatrix) * normal);
    vLocalPosition = position;
    vColor = SHAPE_COLORS[gl_InstanceID];
    vEmissive = gl_InstanceID == SUN_SHAPE ? 1 : 0;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(vWorldPosition, 1.0);
}
```

# Reference Fragment Shader
```glsl
in vec3 vNormal;
in vec3 vWorldPosition;
in vec3 vLocalPosition;
in vec3 vColor;
flat in int vEmissive;

out vec4 fragColor;

void main() {
    if (vEmissive == 1) {
        fragColor = vec4(vColor, 1.0);
        return;
    }

    // Ein Laengengrad-Streifen macht die Eigenrotation sichtbar.
    float longitude = atan(vLocalPosition.z, vLocalPosition.x);
    float stripe = 1.0 - 0.35 * smoothstep(0.92, 0.98, cos(longitude));
    vec3 color = vColor * stripe;

    // Die Szene wird immer direkt von der Sonne im Ursprung aus beleuchtet.
    vec3 lightDirection = normalize(-vWorldPosition);
    float diffuse = max(dot(normalize(vNormal), lightDirection), 0.0);
    fragColor = vec4(color * (0.06 + diffuse), 1.0);
}
```
