---
category: Computer Animation
type: 2D
title: Volumetric Raymarching
hints:
  - Berechne für jedes Pixel die Rayrichtung aus Kameraposition, Blickrichtung und FOV.
  - Inkrementiere den Ray schrittweise entlang der Richtung und summiere die Farbdichte auf.
  - Beende die Schleife, wenn der Ray das Volumen verlässt oder die maximale Tiefe erreicht ist.
---
# Task
Die Studierenden lernen, wie man ein **DICOM-Slice** volumetrisch raymarcht und visualisiert.  
Der aktuelle Shader dient als Platzhalter.  
Später wird das SDF durch echte DICOM-Slices ersetzt.

- **Dauer:** 30 Minuten
  - SDF-Raymarching Grundlagen: 15 min
    - Kamerastrahl berechnen
    - Distance Function definieren  
    - Raymarch-Schleife
  - Raymarching auf DICOM-Slice: 15 min  
    - Slice-Textur abtasten
    - Intensität → Farbe
    - Raymarch entlang der Tiefe

# Theory

## 1. Kamerakoordinaten und Rayberechnung

Die Kamera wird durch ihre **Position** $\mathbf{C} \in \mathbb{R}^3$, ihre **Blickrichtung** $\mathbf{f}$ (forward) und einen Up-Vektor $\mathbf{u}$ definiert. Aus diesen Vektoren lässt sich eine orthonormale Kamerabasis aufbauen:

$$
\mathbf{r} = \frac{\mathbf{f} \times \mathbf{u}}{\|\mathbf{f} \times \mathbf{u}\|} \quad \text{(right)}
$$

$$
\mathbf{v} = \mathbf{r} \times \mathbf{f} \quad \text{(up)}
$$

Die Kamera-Basis besteht dann aus $(\mathbf{r}, \mathbf{v}, -\mathbf{f})$.

Für jedes Pixel auf dem Fullscreen-Quad mit Normalized Device Coordinates (NDC) $\mathbf{p}_\text{ndc} = (x_\text{ndc}, y_\text{ndc})$ berechnen wir die Richtung des Rays:

$$
\mathbf{d} = \frac{\mathbf{f} + x_\text{ndc} \cdot \mathbf{r} \cdot \tan(\theta_x) + y_\text{ndc} \cdot \mathbf{v} \cdot \tan(\theta_y)}
{\|\mathbf{f} + x_\text{ndc} \cdot \mathbf{r} \cdot \tan(\theta_x) + y_\text{ndc} \cdot \mathbf{v} \cdot \tan(\theta_y)\|}
$$

wobei

$$
\theta_y = \frac{\text{FOV}}{2}, \quad \theta_x = \theta_y \cdot \frac{w}{h}
$$

mit $w/h$ dem Seitenverhältnis des Viewports. Der Ray startet dann an

$$
\mathbf{o} = \mathbf{C}
$$

und verläuft in Richtung $\mathbf{d}$.

---

## 2. Signed Distance Fields (SDF)

Eine **Signed Distance Field (SDF)** $f: \mathbb{R}^3 \to \mathbb{R}$ gibt den Abstand eines Punktes $\mathbf{p}$ zur Oberfläche eines Objekts an:

$$
f(\mathbf{p}) =
\begin{cases}
< 0 & \text{innerhalb des Objekts} \\
= 0 & \text{auf der Oberfläche} \\
> 0 & \text{außerhalb des Objekts}
\end{cases}
$$

Beispiel Kugel mit Radius $r$ und Zentrum $\mathbf{c}$:

$$
f_\text{sphere}(\mathbf{p}) = \|\mathbf{p} - \mathbf{c}\| - r
$$

Beispiel Würfel mit Halbkanten $b = (b_x, b_y, b_z)$:

$$
f_\text{cube}(\mathbf{p}) = 
\left\| \max\big(|\mathbf{p} - \mathbf{c}| - b, \mathbf{0} \big) \right\| + 
\min\big(\max(|\mathbf{p}-\mathbf{c}| - b), 0\big)
$$

Für die Kombination mehrerer Objekte kann man eine **smooth min**-Funktion verwenden:

$$
\text{smin}(a, b, k) = -\frac{1}{k} \log\big(e^{-k a} + e^{-k b}\big)
$$

---

## 3. Raymarching

Raymarching ist ein **diskreter Integrationsprozess** entlang des Strahls:

1. Initialisiere $t = 0$, die Distanz vom Ray-Startpunkt entlang der Richtung.
2. In jedem Schritt berechne die aktuelle Position:

$$
\mathbf{p} = \mathbf{o} + t \mathbf{d}
$$

3. Berechne die Distanz zum Volumen:

$$
d = f(\mathbf{p})
$$

4. Akkumuliere Farbe oder Dichte, z.B.:

$$
\text{color} \; += \; \text{opacity} \cdot \text{volumeColor}(\mathbf{p})
$$

5. Inkrementiere den Ray um mindestens $d$ oder einen minimalen Schritt $\delta$:

$$
t = t + \max(d, \delta)
$$

6. Abbruchbedingung: $d < \epsilon$ oder $t > t_\text{max}$.

# Reference Vertex Shader
```glsl
precision highp float;

in vec3 position;
in vec2 uv;

out vec2 vUv;

void main() {
    vUv = uv * 2.0 - 1.0;
    gl_Position = vec4(position, 1.0);
}
```

# Reference Fragment Shader
```glsl
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec3 cameraPosition;
uniform vec3 cameraDirection;
uniform float cameraFov;
uniform vec2 iResolution;

// Utility: smooth min for blending
float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

// SDF primitives
float sphereSDF(vec3 p, float r) {
    return length(p) - r;
}

float cubeSDF(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// Connected cube + sphere
float connectedSphereCubeSDF(vec3 p) {
    float cube = cubeSDF(p - vec3(-0.4, 0.0, 0.0), vec3(0.35));
    float sphere = sphereSDF(p - vec3(0.3, 0.0, 0.0), 0.35);
    return smin(cube, sphere, 0.25);
}

void main() {
    // Camera basis
    vec3 forward = normalize(cameraDirection);
    vec3 worldUp = vec3(0.0, 1.0, 0.0);
    vec3 right = normalize(cross(forward, worldUp));
    vec3 up = cross(right, forward);

    // Aspect & FOV
    float aspect = iResolution.x / iResolution.y;
    float scale = tan(cameraFov * 0.5);

    // Compute ray direction
    vec3 rayDir = normalize(forward + vUv.x * right * scale * aspect + vUv.y * up * scale);
    vec3 rayOrigin = cameraPosition;

    // Raymarch
    float t = 0.0;
    float totalDensity = 0.0;
    const float maxDist = 50.0;

    for (int i = 0; i < 256; i++) {
        vec3 p = rayOrigin + rayDir * t;
        float d = connectedSphereCubeSDF(p);

        if (d < 0.0)
            totalDensity += 0.025;

        t += max(d, 0.01);

        if (t > maxDist)
        break;
    }

    fragColor = vec4(vec3(clamp(totalDensity, 0.0, 1.0)), 1.0);
}
```

# Starter Vertex Shader
```glsl
precision highp float;

in vec3 position;
in vec2 uv;

out vec2 vUv;

void main() {
    vUv = uv * 2.0 - 1.0;
    gl_Position = vec4(position, 1.0);
}
```

# Starter Fragment Shader
```glsl
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec3 cameraPosition;
uniform vec3 cameraDirection;
uniform float cameraFov;
uniform vec2 iResolution;

void main() {
    vec2 uv = vUv;
    uv.x *= iResolution.x / iResolution.y;

    vec2 center = vec2(0.0, 0.0);
    float radius = 0.5;

    float dist = length(uv - center);

    vec3 color = vec3(0.0); // Standardfarbe: schwarz
    if (dist < radius) {
        color = vec3(1.0); // Innerhalb des Kreises: weiß
    }
    fragColor = vec4(color, 1.0);
}
```