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
Implementiere den Bresenham-Linienalgorithmus ausschließlich mit Ganzzahlarithmetik. Beginne mit dem Fall aus der Übung, einer Linie von `(0,0)` nach `(4,3)`, und verallgemeinere die Entscheidung anschließend für alle Oktanten.

# Hints

## Hint
Für den Übungsfall gelten `a = Δy`, `b = -Δx`, `Q_init = 2a+b`, `Q_equal = 2a` und `Q_step = 2(a+b)`.

## Hint
Setze zuerst das aktuelle Pixel. Bei `Q < 0` bleibt `y` gleich; andernfalls wird `y` erhöht.

## Hint
Für alle Oktanten brauchst du die Beträge von `Δx` und `Δy` sowie die Schrittvorzeichen `sx` und `sy`. Bei einer steilen Linie übernimmt `y` die Rolle der Hauptlaufrichtung.

# Theory
## Entscheidungsvariable der Übung

Für den ersten Oktanten gilt `0 ≤ Δy ≤ Δx` und `x` wird in jedem Schritt erhöht. Mit

`a = y2-y1 = Δy` und `b = -(x2-x1) = -Δx`

verwendet die Übung folgende ganzzahlige Größen:

- `Q_init = 2a+b = 2Δy-Δx`
- `Q_equal = 2a = 2Δy`
- `Q_step = 2(a+b) = 2(Δy-Δx)`

Ist `Q < 0`, liegt die ideale Linie näher am horizontal benachbarten Pixel: `y` bleibt gleich und `Q += Q_equal`. Andernfalls wird diagonal gegangen: `y++` und `Q += Q_step`. Für `(0,0) → (4,3)` ergeben sich `Q_init=2`, `Q_equal=6` und `Q_step=-2`.

## Verallgemeinerung auf alle Oktanten

Der Code aus der Übung setzt `x1 ≤ x2` und eine Steigung zwischen 0 und 1 voraus. Beim Vertauschen der Endpunkte erfüllt er diese Voraussetzung nicht mehr. Die Referenzlösung im Shader verwendet deshalb die symmetrische Bresenham-Form:

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

const int GRID_SIZE = 32;

// Convert from UV (0–1) to aspect-corrected space (-1–1)
vec2 aspectCorrectUV(vec2 uv) {
    vec2 p = uv * 2.0 - 1.0;
    p.x *= iResolution.x / iResolution.y;
    return p;
}

// Convert pixel grid coordinate to aspect-corrected UV space (-1..1)
vec2 gridToUV(int x, int y) {
    vec2 p = (vec2(float(x), float(y)) / float(GRID_SIZE)) * 2.0 - 1.0;
    p.x *= iResolution.x / iResolution.y;
    return p;
}

// Determine if the fragment lies inside a grid pixel (square)
bool isInsidePixel(vec2 uv, int x, int y) {
    // Compute bounds in aspect-corrected space
    vec2 minP = gridToUV(x, y);
    vec2 maxP = gridToUV(x + 1, y + 1);

    // Compute fragment position
    vec2 f = aspectCorrectUV(uv);

    return all(greaterThanEqual(f, minP)) && all(lessThan(f, maxP));
}

// Draw a single pixel cell with color
void drawPixel(int x, int y, inout vec3 color, vec3 pixelColor) {
    if (isInsidePixel(vUV, x, y)) {
        color = pixelColor;
    }
}
// @prefix

// Integer Bresenham line
void bresenhamLine(int x0, int y0, int x1, int y1, inout vec3 color) {

}

// @suffix
void main() {
    vec3 color = vec3(0.12); // dark gray background

    // Optional grid lines (1px thin)
    vec2 uv = vUV * float(GRID_SIZE);
    vec2 gridLine = smoothstep(0.98, 1.0, abs(fract(uv) - 0.5) * 2.0);
    float gridMask = min(gridLine.x, gridLine.y);
    color = mix(vec3(0.15), color, gridMask);

    // Define line endpoints in grid coordinates
    int x0 = int(0.05 * float(GRID_SIZE));
    int y0 = int(0.25 * float(GRID_SIZE));
    int x1 = int(0.95 * float(GRID_SIZE));
    int y1 = int(0.85 * float(GRID_SIZE));

    // Draw Bresenham line
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

// Convert from UV (0–1) to aspect-corrected space (-1–1)
vec2 aspectCorrectUV(vec2 uv) {
    vec2 p = uv * 2.0 - 1.0;
    p.x *= iResolution.x / iResolution.y;
    return p;
}

// Convert pixel grid coordinate to aspect-corrected UV space (-1..1)
vec2 gridToUV(int x, int y) {
    vec2 p = (vec2(float(x), float(y)) / float(GRID_SIZE)) * 2.0 - 1.0;
    p.x *= iResolution.x / iResolution.y;
    return p;
}

// Determine if the fragment lies inside a grid pixel (square)
bool isInsidePixel(vec2 uv, int x, int y) {
    // Compute bounds in aspect-corrected space
    vec2 minP = gridToUV(x, y);
    vec2 maxP = gridToUV(x + 1, y + 1);

    // Compute fragment position
    vec2 f = aspectCorrectUV(uv);

    return all(greaterThanEqual(f, minP)) && all(lessThan(f, maxP));
}

// Draw a single pixel cell with color
void drawPixel(int x, int y, inout vec3 color, vec3 pixelColor) {
    if (isInsidePixel(vUV, x, y)) {
        color = pixelColor;
    }
}

// Integer Bresenham line
void bresenhamLine(int x0, int y0, int x1, int y1, inout vec3 color) {
    int dx = abs(x1 - x0);
    int sx = x0 < x1 ? 1 : -1;
    int dy = -abs(y1 - y0);
    int sy = y0 < y1 ? 1 : -1;
    int err = dx + dy;
    int e2;

    int x = x0;
    int y = y0;

    for (int i = 0; i < 512; i++) { // safety loop
        drawPixel(x, y, color, vec3(1.0, 0.0, 0.0)); // red pixel

        if (x == x1 && y == y1) break;

        e2 = 2 * err;
        if (e2 >= dy) { err += dy; x += sx; }
        if (e2 <= dx) { err += dx; y += sy; }
    }
}

void main() {
    vec3 color = vec3(0.12); // dark gray background

    // Define line endpoints in grid coordinates
    int x0 = int(0.05 * float(GRID_SIZE));
    int y0 = int(0.25 * float(GRID_SIZE));
    int x1 = int(0.95 * float(GRID_SIZE));
    int y1 = int(0.85 * float(GRID_SIZE));

    // Draw Bresenham line
    bresenhamLine(x0, y0, x1, y1, color);

    fragColor = vec4(color, 1.0);
}
```
