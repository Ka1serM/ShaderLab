---
category: Grundlagen Computergrafik
type: 2D
title: Bresenham
modelPath: models/Cube.glb
hints:
- Nutze Ganzzahllogik, um Linienpixel zu setzen
---

# Task
Implementiere den Bresenham-Linienalgorithmus

# Theory
## 1. Ausgangspunkt: die ideale Linie

Eine Linie zwischen zwei Punkten $(x_0, y_0)$ und $(x_1, y_1)$ kann in der Steigungsform geschrieben werden:

$$
y = m \cdot x + b
$$

- $m = \frac{y_1 - y_0}{x_1 - x_0}$ → Steigung  
- $b = y_0 - m \cdot x_0$ → y-Achsenabschnitt  

> Das ist die "perfekte" Linie in kontinuierlichen Koordinaten.

---

## 2. Problem: Raster / Pixel

Auf einem Bildschirm oder Raster können wir **nur Pixel mit ganzzahligen Koordinaten setzen**.  

- Wir müssen entscheiden, **welches Pixel in jeder Spalte gesetzt wird**, um der Linie möglichst genau zu folgen.  
- Einfaches Runden der Gleitkommawerte ist möglich, aber **langsam**, weil es Multiplikationen und Rundungen benötigt.  

---

## 3. Schrittweise Annäherung

Betrachte die Linie Schritt für Schritt von $x_0$ nach $x_1$:  

- Aktuelles Pixel: $(x, y)$  
- Ideale Linie: $y_\text{ideal} = m \cdot x + b$  
- Wir müssen entscheiden: **y bleibt gleich oder y wird um 1 erhöht?**

---

## 4. Differenzen definieren

Wir berechnen die Differenzen:

$$
\Delta x = x_1 - x_0, \quad \Delta y = y_1 - y_0
$$

- $\Delta x$ = horizontale Länge  
- $\Delta y$ = vertikale Länge  

Die Steigung der Linie ist $m = \frac{\Delta y}{\Delta x}$.  

---

## 5. Fehlerbegriff

Wir definieren einen **Fehler**:

$$
\text{Fehler} = y_\text{ideal} - y_\text{aktuell}
$$

- Wenn Fehler > 0 → die Linie liegt **über** der Pixelmitte → y muss erhöht werden.  
- Wenn Fehler ≤ 0 → die Linie liegt **unterhalb** oder auf der Pixelmitte → y bleibt gleich.

### 5.1. Problem: Gleitkomma vermeiden

- Um nur mit **Ganzzahlen** zu rechnen, multiplizieren wir alles mit $\Delta x$, um den Bruch $\Delta y / \Delta x$ zu eliminieren:  

$$
\Delta x \cdot \text{Fehler} = \Delta x \cdot (y_\text{ideal} - y_\text{aktuell}) 
= (\Delta y \cdot (x - x_0) + \Delta x \cdot y_0) - \Delta x \cdot y
$$

- Definiere den **entscheidenden Ganzzahl-Fehlerterm**:

$$
D = 2 \Delta y - \Delta x
$$

> Durch geschicktes Multiplizieren mit $2 \Delta y$ und $\Delta x$ können wir **nur Ganzzahlen verwenden**, ohne Gleitkomma.

---

## 6. Iteration mit dem Fehlerterm

Für jede Spalte $x$ (von $x_0$ bis $x_1$):

1. Zeichne Pixel $(x, y)$  
2. Prüfe den Fehlerterm $D$:  
   - Wenn $D > 0$: Pixel in **y-Richtung erhöhen**, und Fehler anpassen: $D = D - 2 \Delta x$  
   - Immer: Fehler erhöhen: $D = D + 2 \Delta y$  
3. $x$ wird immer um 1 erhöht (oder $y$ bei steilen Linien)

---

## 7. Steile Linien

- Wenn $|\Delta y| > |\Delta x|$ → Linie steiler als 45°  
- Lösung: **x und y tauschen**, Algorithmus unverändert  
- Vorzeichen berücksichtigen:

$$
s_x = \text{sign}(x_1 - x_0), \quad s_y = \text{sign}(y_1 - y_0)
$$

- Damit funktioniert der Algorithmus in allen vier Richtungen.

---

## 8. Zusammenfassung

- Fehlerterm $D$ misst **Abweichung der idealen Linie vom aktuellen Pixel**  
- Entscheidung: **Pixel in y-Richtung erhöhen oder nicht**  
- Nur Ganzzahlen → sehr effizient  
- Ergebnis: **pixelgenaue Linie**, die der idealen Linie sehr nahekommt

# Starter Vertex Shader
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

# Starter Fragment Shader
```glsl
precision highp float;

in vec2 vUV;
out vec4 fragColor;

const int GRID_SIZE = 32;

// Draw a "pixel" in UV space from grid coordinates
void drawPixel(int x, int y, inout vec3 color) {
    vec2 target = vec2(float(x) / float(GRID_SIZE), float(y) / float(GRID_SIZE));
    float threshold = 0.5 / float(GRID_SIZE); // half pixel
    if(length(vUV - target) < threshold) {
        color = vec3(1.0, 0.0, 0.0); // red pixel
    }
}

void bresenhamLine(int x0, int y0, int x1, int y1, inout vec3 color) {
    // Implement Bresenham integer line algorithm here
    // Use drawPixel(x, y, color) to plot each point
}

void main() {
    vec3 color = vec3(0.0); // black background

    // Define line endpoints in grid coordinates
    int x0 = int(0.05 * float(GRID_SIZE));
    int y0 = int(0.45 * float(GRID_SIZE));
    int x1 = int(0.95 * float(GRID_SIZE));
    int y1 = int(0.95 * float(GRID_SIZE));

    bresenhamLine(x0, y0, x1, y1, color);

    fragColor = vec4(color, 1.0);
}
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

const int GRID_SIZE = 32;

// Draw a "pixel" in UV space from grid coordinates
void drawPixel(int x, int y, inout vec3 color) {
    vec2 target = vec2(float(x) / float(GRID_SIZE), float(y) / float(GRID_SIZE));
    float threshold = 0.5 / float(GRID_SIZE); // half pixel
    if(length(vUV - target) < threshold) {
        color = vec3(1.0, 0.0, 0.0); // red pixel
    }
}

// Bresenham line implementation
void bresenhamLine(int x0, int y0, int x1, int y1, inout vec3 color) {
    int dx = abs(x1 - x0);
    int dy = abs(y1 - y0);
    int sx = x0 < x1 ? 1 : -1;
    int sy = y0 < y1 ? 1 : -1;

    bool steep = dy > dx;
    if (steep) {
        // Swap x and y
        int tmp;
        tmp = x0; x0 = y0; y0 = tmp;
        tmp = x1; x1 = y1; y1 = tmp;
        tmp = dx; dx = dy; dy = tmp;
        tmp = sx; sx = sy; sy = tmp;
    }

    int err = 2 * dy - dx;
    int y = y0;

    for (int i = 0; i <= dx; i++) {
        if (steep) {
            drawPixel(y, x0, color);
        } else {
            drawPixel(x0, y, color);
        }

        if (err > 0) {
            y += sy;
            err -= 2 * dx;
        }
        err += 2 * dy;
        x0 += sx;
    }
}

void main() {
    vec3 color = vec3(0.0); // black background

    // Define line endpoints in grid coordinates
    int x0 = int(0.05 * float(GRID_SIZE));
    int y0 = int(0.45 * float(GRID_SIZE));
    int x1 = int(0.95 * float(GRID_SIZE));
    int y1 = int(0.95 * float(GRID_SIZE));

    // Draw the line
    bresenhamLine(x0, y0, x1, y1, color);

    fragColor = vec4(color, 1.0);
}
