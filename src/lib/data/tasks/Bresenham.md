---
category: Einführung
type: 2D
title: Bresenham
shaderStages:
  - fragment
camera:
  position: [0, 0, 1]
  target: [0, 0, 0]
  fov: 30
overlays:
  infiniteGrid: false
  viewHelper: false
---

# Task
Implementiere in `bresenhamLine(...)` den Bresenham-Linienalgorithmus. Die Vorschau zeichnet die von dir berechneten Rasterzellen als dünne helle Linie; sie muss für jeden möglichen Anfangs- und Endpunkt korrekt sein. Bewege den Mauszeiger über die Vorschau, um eine Linie vom Rastermittelpunkt zur Mausposition zu zeichnen.

1. **Erster Oktant:** Implementiere zunächst Linien mit einer positiven Steigung zwischen 0 und 1. Verwende ausschließlich Ganzzahlarithmetik und zeichne die einzelnen Zellen über `drawPixel(...)`.
2. **Oktanten 4, 5 und 8:** Erweitere die Entscheidung für negative Laufrichtungen. Kommentiere im Shader, welche grundlegende Änderung für den jeweiligen Oktanten nötig ist.
3. **Oktanten 2, 3, 6 und 7:** Ergänze die steilen Linien. Am Ende muss `bresenhamLine(...)` alle acht Oktanten abdecken.

Nutze die Symmetrie-Eigenschaften des Algorithmus: Eine Kette aus acht getrennten Sonderfällen gilt nicht als vollständige Lösung. Beachte außerdem, dass die y-Achse in der Bildschirmdarstellung nach unten zeigt.

# Theory
## Entscheidungsvariable

Für den ersten Oktanten gilt `0 ≤ Δy ≤ Δx` und `x` wird in jedem Schritt erhöht. Mit

`a = y2-y1 = Δy` und `b = -(x2-x1) = -Δx`

verwenden wir folgende ganzzahlige Größen:

- `Q_init = 2a+b = 2Δy-Δx`
- `Q_equal = 2a = 2Δy`
- `Q_step = 2(a+b) = 2(Δy-Δx)`

Ist `Q < 0`, liegt die ideale Linie näher am horizontal benachbarten Pixel: `y` bleibt gleich und `Q += Q_equal`. Andernfalls wird diagonal gegangen: `y++` und `Q += Q_step`. Für `(0,0) → (4,3)` ergeben sich `Q_init=2`, `Q_equal=6` und `Q_step=-2`.

## Verallgemeinerung auf alle Oktanten

Der zunächst betrachtete Code setzt `x1 ≤ x2` und eine Steigung zwischen 0 und 1 voraus. Beim Vertauschen der Endpunkte erfüllt er diese Voraussetzung nicht mehr. Die Referenzlösung im Shader verwendet deshalb die symmetrische Bresenham-Form:

- `dx = abs(x1-x0)` und `dy = -abs(y1-y0)` speichern die Beträge.
- `sx` und `sy` speichern die Laufrichtung.
- Zwei unabhängige Entscheidungen erlauben Schritte in x-, y- oder beide Richtungen.

Beide Schreibweisen treffen dieselbe Mittelpunktentscheidung und benötigen in der Schleife weder Division noch Gleitkommaarithmetik.

# Starter Vertex Shader
```glsl
// @prefix
precision highp float;

in vec3 position;
in vec3 normal;
in vec2 uv;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

out vec2 vUV;

void main() {
    vUV = uv;
    gl_Position = vec4(position, 1.0);
}
// @prefix
```

# Starter Fragment Shader
```glsl
// @prefix
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform vec2 iResolution;
uniform vec3 iMouse;

const int GRID_SIZE = 64;

vec2 viewportPixel(vec2 uv) {
    return uv * iResolution;
}

float gridCellSize() {
    return min(iResolution.x, iResolution.y) / float(GRID_SIZE);
}

vec2 gridToViewportPixel(int x, int y) {
    return vec2(float(x), float(y)) * gridCellSize();
}

bool isInsidePixel(vec2 uv, int x, int y) {
    float cellSize = gridCellSize();
    vec2 minP = gridToViewportPixel(x, y);
    vec2 maxP = minP + vec2(cellSize);
    vec2 f = viewportPixel(uv);

    return all(greaterThanEqual(f, minP)) && all(lessThan(f, maxP));
}

void drawPixel(int x, int y, inout vec3 color, vec3 pixelColor) {
    if (isInsidePixel(vUV, x, y)) {
        color = pixelColor;
    }
}
// @prefix

void bresenhamLine(int x0, int y0, int x1, int y1, inout vec3 color) {

}

// @suffix
void main() {
    vec3 color = vec3(0.12);

    float cellSize = gridCellSize();
    int gridWidth = int(ceil(iResolution.x / cellSize));
    int gridHeight = int(ceil(iResolution.y / cellSize));

    int x0 = 0;
    int y0 = 0;
    int x1 = gridWidth - 1;
    int y1 = min(gridHeight - 1, int(0.75 * float(gridWidth)));
    if (iMouse.z > 0.5) {
        x0 = gridWidth / 2;
        y0 = gridHeight / 2;
        vec2 mousePixel = vec2(iMouse.x, iResolution.y - iMouse.y);
        vec2 mouseGrid = mousePixel / cellSize;
        x1 = max(0, min(gridWidth - 1, int(floor(mouseGrid.x))));
        y1 = max(0, min(gridHeight - 1, int(floor(mouseGrid.y))));
    }

    bresenhamLine(x0, y0, x1, y1, color);

    fragColor = vec4(color, 1.0);
}
// @suffix
```

# Reference Vertex Shader
```glsl
precision highp float;

in vec3 position;
in vec3 normal;
in vec2 uv;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

out vec2 vUV;

void main() {
    vUV = uv;
    gl_Position = vec4(position, 1.0);
}
```

# Reference Fragment Shader
```glsl
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform vec2 iResolution;

const int GRID_SIZE = 64;

uniform vec3 iMouse;

vec2 viewportPixel(vec2 uv) {
    return uv * iResolution;
}

float gridCellSize() {
    return min(iResolution.x, iResolution.y) / float(GRID_SIZE);
}

vec2 gridToViewportPixel(int x, int y) {
    return vec2(float(x), float(y)) * gridCellSize();
}

bool isInsidePixel(vec2 uv, int x, int y) {
    float cellSize = gridCellSize();
    vec2 minP = gridToViewportPixel(x, y);
    vec2 maxP = minP + vec2(cellSize);
    vec2 f = viewportPixel(uv);

    return all(greaterThanEqual(f, minP)) && all(lessThan(f, maxP));
}

void drawPixel(int x, int y, inout vec3 color, vec3 pixelColor) {
    if (isInsidePixel(vUV, x, y)) {
        color = pixelColor;
    }
}

void bresenhamLine(int x0, int y0, int x1, int y1, inout vec3 color) {
    int dx = abs(x1 - x0);
    int sx = x0 < x1 ? 1 : -1;
    int dy = -abs(y1 - y0);
    int sy = y0 < y1 ? 1 : -1;
    int err = dx + dy;
    int e2;

    int x = x0;
    int y = y0;

    for (int i = 0; i < 512; i++) {
        drawPixel(x, y, color, vec3(1.0, 0.0, 0.0));

        if (x == x1 && y == y1) break;

        e2 = 2 * err;
        if (e2 >= dy) { err += dy; x += sx; }
        if (e2 <= dx) { err += dx; y += sy; }
    }
}

void main() {
    vec3 color = vec3(0.12);

    float cellSize = gridCellSize();
    int gridWidth = int(ceil(iResolution.x / cellSize));
    int gridHeight = int(ceil(iResolution.y / cellSize));

    int x0 = 0;
    int y0 = 0;
    int x1 = gridWidth - 1;
    int y1 = min(gridHeight - 1, int(0.75 * float(gridWidth)));
    if (iMouse.z > 0.5) {
        x0 = gridWidth / 2;
        y0 = gridHeight / 2;
        vec2 mousePixel = vec2(iMouse.x, iResolution.y - iMouse.y);
        vec2 mouseGrid = mousePixel / cellSize;
        x1 = max(0, min(gridWidth - 1, int(floor(mouseGrid.x))));
        y1 = max(0, min(gridHeight - 1, int(floor(mouseGrid.y))));
    }

    bresenhamLine(x0, y0, x1, y1, color);

    fragColor = vec4(color, 1.0);
}
```
