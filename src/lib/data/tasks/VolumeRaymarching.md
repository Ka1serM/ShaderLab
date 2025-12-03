---
category: Computer Animation
type: 2D
inputs:
  - name: volumeTexture
    type: texture3D
    init: textures/CTVolumeAtlas.raw
title: Volumetric Raymarching
hints:
---

# Task

Wir bauen einen Volume Renderer basierend auf der Pipeline von Marc Levoy. Hilfsfunktionen für Gradienten und Beleuchtung sind bereits gegeben.

## Aufgaben

1.  **Orthographic Ray Generation**
    *   Bestimmen Sie Startpunkt (`rayOrigin`) und Richtung (`rayDirection`) des Strahls.
    *   *Feedback:* Sobald dies implementiert ist, wechselt die Ansicht automatisch von "UV-Gradient" zu "Ray-Koordinaten" (Bunt).

2.  **Raymarching Loop**
    *   Implementieren Sie die Schleife, die das Volumen abtastet.
    *   *Feedback:* Sobald der Loop läuft, sehen Sie den Kopf im Viewport.

3.  **Transfer Function**
    *   Implementieren Sie die Transfer Funktion, um Dichtewerte in Farben zu übersetzen (Luft, Gewebe, Knochen).
    *   *Ergebnis:* Ein korrektes, eingefärbtes CT-Bild (Haut & Knochen).

## Nützliches zur Programmierung

### **Vektoren und Skalare**
- `vec3` = 3 Komponenten, `vec4` = 4 Komponenten  
- Zugriff auf Komponenten: `.x`, `.y`, `.z` oder `.r`, `.g`, `.b`  oder `.rgb`
- Ganze Vektoren oder einzelne Komponenten können mit Skalaren multipliziert oder addiert werden:

```glsl
vec3 pos = origin + direction * t;  // Addition + Skalierung
vec3 rgb = vec3(1.0, 0.5, 0.0);    // Initialisierung eines Vektors
```
- Skalar * Skalar = Skalar, Vektor + Vektor = Vektor, Vektor * Skalar = Vektor

---

### **If-Abfragen**
```glsl
// if / else if / else für Wertebereiche:

if (wert < grenzeA) {  
 // Aktion 1  
}  
else if (wert < grenzeB) {  
 // Aktion 2  
}  
else {  
 // Standardfall  
}
```

---

### **Interpolation / mix**
- `mix(a, b, t)` blendet linear zwischen a und b  
- t = 0 → Ergebnis = a, t = 1 → Ergebnis = b

```glsl
float t = (x - min) / (max - min);  // Normalisierung eines Wertes für mix

vec3 ergebnis = mix(vec3(0.0), vec3(1.0, 0.0, 0.0), t);
```
---

### **For-Schleifen**
for-Schleifen wiederholen Schritte:
```glsl
for (int i = 0; i < steps; i++) {  
 float t = float(i) * stepSize;  // int → float für Berechnung  
 // Verarbeitung von t  
}
```
- `continue;` springt zum nächsten Schleifendurchlauf

---

### **Überprüfung von Vektoren**
any() prüft, ob **irgendeine Komponente** einer Bedingung entspricht:

```glsl
if (any(lessThan(pos, vec3(0.0))) || any(greaterThan(pos, vec3(1.0)))) {  
 continue;  // Überspringt ungültige Position  
}
```

---

### **SampleVolume**

SampleVolume berechnet **an einer 3D-Koordinate im Volumen** die benötigten Werte.

```glsl
vec4 sample = SampleVolume(coord, direction);
```

- **Inputs:**  
  - `coord` → 3D-Position im normalisierten Raum (0..1)  
  - `direction` → Richtungsvektor (für Gradienten / Beleuchtung berechnung)  
- **Output:** `vec4`  
  - `rgb` → berechnete Farbe / Materialwert  
  - `a` → Transparenz / Gewichtung

# Theory

## 1. Strahlgenerierung (Orthographisch)
Bei einer orthographischen Kamera sind alle Strahlen parallel. Der Startpunkt verschiebt sich basierend auf der Pixelposition auf der Bildebene relativ zur Kameraposition.

*   **Richtung** ($\vec{D}$): Entspricht konstant dem `forward` Vektor der Kamera.
*   **Startpunkt** ($O$):
    $$
    O = P_{camera} + (\vec{Right} \cdot x_{uv} + \vec{Up} \cdot y_{uv}) \cdot \text{scale}
    $$
    *(Code-Variablen: `pixelPos.x` entspricht $x_{uv}$, `orthoScale` entspricht scale)*

## 2. Raymarching Loop (Back-to-Front)
Wir laufen den Strahl von hinten nach vorne ab. Der Parameter $t$ läuft in der Schleife von `maxSteps` (bzw. 1.0) runter auf $0$.

*   **Position auf dem Strahl**:
    $$
    P(t) = O + t \cdot \vec{D}
    $$
*   **Textur-Koordinate**:
    Da der Volumenwürfel im Weltraum um $(0,0,0)$ zentriert ist, Texturen aber Koordinaten von $0$ bis $1$ erwarten, müssen wir verschieben:
    $$
    \vec{UVW} = P(t) + 0.5
    $$
*   **Bounds Check**:
    Samples sind nur gültig, wenn $\vec{UVW} \in [0, 1]$. Liegt der Punkt außerhalb, wird er ignoriert (`continue`).

## 3. Compositing (Over Operator)
Das Mischen der Farben erfolgt iterativ. Da wir von hinten nach vorne laufen, "übermalen" wir die bisherige Farbe mit der neuen Schicht, gewichtet nach deren Transparenz.

$$
C_{acc} = C_{src} \cdot \alpha_{src} + C_{acc} \cdot (1 - \alpha_{src})
$$

*   $C_{acc}$: Bisher akkumulierte Farbe (Variable `accumulatedColor`).
*   $C_{src}, \alpha_{src}$: Farbe und Alpha des aktuellen Voxels (Rückgabe von `SampleVolume`).

## 4. Transfer Function
Die Dichte (HU) bestimmt das Material. Wir interpolieren linear zwischen den bekannten Stützstellen.

| Material | HU Wert ($F$) | Farbe | Opazität ($\alpha$) |
| :--- | :--- | :--- | :--- |
| **Luft** | $\le \text{huAir}$ | Schwarz (0,0,0) | $0.0$ |
| **Gewebe** | $\dots \text{huTissue}$ | $\to$ `colorTissue` | $\to$ `alphaTissue` |
| **Knochen**| $\ge \text{huBone}$ | `colorBone` | `alphaBone` |

*Berechnen Sie für Bereiche zwischen den Werten einen Faktor $t$ (0 bis 1) und nutzen Sie `mix`.*

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
precision highp sampler3D;

in vec2 vUv;
out vec4 fragColor;

uniform vec3 cameraPosition;
uniform vec3 cameraDirection;
uniform sampler3D volumeTexture;
uniform ivec2 iResolution;

// Parameter aus der Vorlesung
const float stepSize = 0.00256;
const int   maxSteps = 512;
const vec3  lightDir = normalize(vec3(1.0, 1.0, 0.0));
const float orthoScale = 0.5;

vec3 ComputeGradient(vec3 samplePosition) {
    vec3 H = 1.0 / vec3(textureSize(volumeTexture, 0)); 
    float Fx1 = texture(volumeTexture, clamp(samplePosition + vec3(H.x, 0.0, 0.0), 0.0, 1.0)).r;
    float Fx2 = texture(volumeTexture, clamp(samplePosition - vec3(H.x, 0.0, 0.0), 0.0, 1.0)).r;
    float Fy1 = texture(volumeTexture, clamp(samplePosition + vec3(0.0, H.y, 0.0), 0.0, 1.0)).r;
    float Fy2 = texture(volumeTexture, clamp(samplePosition - vec3(0.0, H.y, 0.0), 0.0, 1.0)).r;
    float Fz1 = texture(volumeTexture, clamp(samplePosition + vec3(0.0, 0.0, H.z), 0.0, 1.0)).r;
    float Fz2 = texture(volumeTexture, clamp(samplePosition - vec3(0.0, 0.0, H.z), 0.0, 1.0)).r;
    vec3 grad = vec3((Fx1 - Fx2), (Fy1 - Fy2), (Fz1 - Fz2)) / (2.0 * H);
    return grad;
}

vec4 TransferFunction(float density, float gradientMagnitude)
{
    const float huAir    = -800.0;
    const float huTissue =   50.0;
    const float huBone   =  700.0;

    const float alphaAir    = 0.0;
    const float alphaTissue = 0.03;
    const float alphaBone   = 1.0;

    const vec3 colorAir    = vec3(0.0);
    const vec3 colorTissue = vec3(0.929, 0.675, 0.522);
    const vec3 colorBone   = vec3(0.949, 0.898, 0.643);

    float alpha;
    vec3  color;
    
    if (density <= huAir) {
        alpha = alphaAir;
        color = colorAir;
    } 
    else if (density < huTissue) {
        float t = (density - huAir) / (huTissue - huAir);
        alpha = mix(alphaAir, alphaTissue, t);
        color = mix(colorAir, colorTissue, t);
    } 
    else if (density < huBone) {
        float t = (density - huTissue) / (huBone - huTissue);
        alpha = mix(alphaTissue, alphaBone, t);
        color = mix(colorTissue, colorBone, t);
    } 
    else {
        alpha = alphaBone;
        color = colorBone;
    }

    // Gradient Modulation (Levoy)
    alpha *= 1.0 - exp(-5.0 * clamp(gradientMagnitude / 8.0, 0.0, 1.0));

    return vec4(color, alpha);
}

vec3 PhongShade(vec3 N, vec3 BaseColor, vec3 ViewDir, vec3 lightDir) {
    const vec3 Ka = vec3(0.01); 
    const vec3 Kd = vec3(1.0); 
    const vec3 Ks = vec3(0.3); 
    const float NExp = 120.0; 

    vec3 H = normalize(ViewDir + lightDir); 
    float Diff = max(dot(N, lightDir), 0.0); 
    float Spec = pow(max(dot(N, H), 0.0), NExp); 

    return BaseColor * (Ka + Kd * Diff) + Ks * Spec;
}

void GenerateRay(out vec3 rayOrigin, out vec3 rayDirection) {
    float Aspect = float(iResolution.x) / float(iResolution.y); 
    vec2 pixelPos = vUv;
    pixelPos.x *= Aspect; 

    vec3 forward = normalize(cameraDirection);
    vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(right, forward);

    rayDirection = forward;
    rayOrigin = cameraPosition + pixelPos.x * right * orthoScale + pixelPos.y * up * orthoScale; 
}

vec4 SampleVolume(vec3 textureCoord, vec3 rayDirection) {
    float rawValue = texture(volumeTexture, textureCoord).r;
    float density = rawValue - 1100.0; // HU Offset
    
    vec3 gradient = ComputeGradient(textureCoord); 
    float gradMag = length(gradient);

    vec4 material = TransferFunction(density, gradMag); 
    
    vec3 shadedColor = PhongShade(normalize(-gradient), material.rgb, normalize(-rayDirection), lightDir); 

    return vec4(shadedColor, material.a); 
}

vec3 Raymarch(vec3 rayOrigin, vec3 rayDirection) {
    vec3 accumulatedColor = vec3(0.0);
    int totalSteps = min(int(1.0 / stepSize), maxSteps);

    for (int i = totalSteps - 1; i >= 0; --i) {     
        float t = float(i) * stepSize;         
        vec3 currentPosition = rayOrigin + rayDirection * t;
        vec3 textureCoord = currentPosition + 0.5;

        if (textureCoord.x < 0.0 || textureCoord.y < 0.0 || textureCoord.z < 0.0 || 
            textureCoord.x > 1.0 || textureCoord.y > 1.0 || textureCoord.z > 1.0)
            continue;

        vec4 src = SampleVolume(textureCoord, rayDirection);
        accumulatedColor = src.rgb * src.a + accumulatedColor * (1.0 - src.a);
    }
    return accumulatedColor;
}

void main() {
    vec3 rayOrigin, rayDirection;
    GenerateRay(rayOrigin, rayDirection);

    vec3 finalColor = Raymarch(rayOrigin, rayDirection);

    fragColor = vec4(finalColor, 1.0);
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
precision highp sampler3D;

in vec2 vUv;
out vec4 fragColor;

// Uniforms
uniform vec3 cameraPosition;
uniform vec3 cameraDirection;
uniform sampler3D volumeTexture;
uniform ivec2 iResolution;

// Konstanten
const float stepSize = 0.00256;
const int   maxSteps = 512;
const vec3  lightDir = normalize(vec3(1.0, 1.0, 0.0));
const float orthoScale = 0.5;

//  Helper Functions (Bereits implementiert) 

vec3 ComputeGradient(vec3 samplePosition) {
    // Zentraler Differenzenquotient zur Bestimmung der Normale
    vec3 H = 1.0 / vec3(textureSize(volumeTexture, 0));
    float Fx1 = texture(volumeTexture, clamp(samplePosition + vec3(H.x, 0.0, 0.0), 0.0, 1.0)).r;
    float Fx2 = texture(volumeTexture, clamp(samplePosition - vec3(H.x, 0.0, 0.0), 0.0, 1.0)).r;
    float Fy1 = texture(volumeTexture, clamp(samplePosition + vec3(0.0, H.y, 0.0), 0.0, 1.0)).r;
    float Fy2 = texture(volumeTexture, clamp(samplePosition - vec3(0.0, H.y, 0.0), 0.0, 1.0)).r;
    float Fz1 = texture(volumeTexture, clamp(samplePosition + vec3(0.0, 0.0, H.z), 0.0, 1.0)).r;
    float Fz2 = texture(volumeTexture, clamp(samplePosition - vec3(0.0, 0.0, H.z), 0.0, 1.0)).r;
    return vec3((Fx1 - Fx2), (Fy1 - Fy2), (Fz1 - Fz2)) / (2.0 * H);
}

vec3 PhongShade(vec3 N, vec3 BaseColor, vec3 ViewDir) {
    // Blinn-Phong Beleuchtungsmodell
    const vec3 Ka = vec3(0.01); const vec3 Kd = vec3(1.0); const vec3 Ks = vec3(0.3); float NExp = 120.0;
    vec3 H = normalize(ViewDir + lightDir);
    return BaseColor * (Ka + Kd * max(dot(N, lightDir), 0.0)) + Ks * pow(max(dot(N, H), 0.0), NExp);
}













// --------------------------------------------------
//  TASK 3: Transfer Function 
// --------------------------------------------------
vec4 TransferFunction(float density, float gradientMagnitude) {
    // Referenzwerte HU (Hounsfield Units)
    const float huAir    = -800.0;
    const float huTissue =   50.0;
    const float huBone   =  700.0;

    // Zielwerte
    const float alphaTissue = 0.03;
    const float alphaBone   = 1.0;
    const vec3 colorTissue  = vec3(0.929, 0.675, 0.522);
    const vec3 colorBone    = vec3(0.949, 0.898, 0.643);

    vec3 color = vec3(1.0); // Default Weiß
    float alpha = 0.0;      // Default Transparent


    if (density <= huAir) {
        alpha = 0.0;
        color = vec3(0.0);
    }


    // TODO: Implementieren Sie die Klassifizierung für die Zielwerte oben


    else {
        alpha = alphaBone;
        color = colorBone;
    }



    // Fallback für Task 2 (Silhouetten-Modus):
    // Wenn die TransferFunction noch leer ist (alpha 0), aber Dichte da ist, mach es weiß.
    if (alpha == 0.0 && density > huAir) { alpha = 0.1; } 

    return vec4(color, alpha);
}






// SampleVolume berechnet **an einer 3D-Koordinate im Volumen** die benötigten Werte.
// samplePosition → Koordinate im Volumen
// rayDirection → Richtungsvektor (für Gradienten / Beleuchtung berechnung)
// return → vec4, rgb = Farbe, a = Opazität
vec4 SampleVolume(vec3 samplePosition, vec3 rayDirection) {
    float rawValue = texture(volumeTexture, samplePosition).r;
    float density = rawValue - 1100.0; // Korrektur der Rohdaten
    
    vec3 gradient = ComputeGradient(samplePosition);
    
    vec4 material = TransferFunction(density, length(gradient));
    
    // Kantenverstärkung (Levoy)
    material.a *= (1.0 - exp(-5.0 * length(gradient))); 

    vec3 shadedColor = PhongShade(normalize(-gradient), material.rgb, -rayDirection);
    return vec4(shadedColor, material.a);
}




// --------------------------------------------------
//  TASK 2: Raymarching Loop 
// --------------------------------------------------
vec3 Raymarch(vec3 rayOrigin, vec3 rayDirection) {

    int totalSteps = min(int(1.0 / stepSize), maxSteps);

    // Sobald Sie Task 2 beginnen, ändern Sie dies auf vec3(0.0) (Schwarz).
    vec3 accumulatedColor = vec3(-1.0);

    // TODO: Implementieren Sie die Raymarching Schleife (Siehe Theory Abschnitt 2 & 3)
    
    return accumulatedColor;
}




// --------------------------------------------------
//  TASK 1: Ray Generation 
// --------------------------------------------------
void GenerateRay(out vec3 rayOrigin, out vec3 rayDirection) {
    float Aspect = float(iResolution.x) / float(iResolution.y);
    vec2 pixelPos = vUv;
    pixelPos.x *= Aspect;

    // Basisvektoren der Kamera
    vec3 forward = normalize(cameraDirection);
    vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(right, forward);

    // TODO: Berechnen Sie Strahlstartpunkt und Richtung für Orthographische Projektion (Siehe Theory Abschnitt 1)
    
    rayDirection = vec3(0.0); // Platzhalter
    rayOrigin = vec3(0.0);    // Platzhalter
}

















void main() {
    vec3 rayOrigin, rayDirection;
    GenerateRay(rayOrigin, rayDirection);

    // Wir rufen den Loop immer auf.
    // Wenn er noch nicht implementiert ist, kommt der Sentinel (-1.0) zurück.
    vec3 resultColor = Raymarch(rayOrigin + 0.5, rayDirection); // +0.5 um den Kopf in den Ursprung zu verschieben

    //  AUTOMATISCHE VORSCHAU 
    
    // ZUSTAND 3: Sentinel (-1.0) wurde im Loop überschrieben -> Task 2 ist aktiv!
    // Wir zeigen das Ergebnis (Schwarz oder Bunt)
    if (resultColor.x >= 0.0) {
        fragColor = vec4(resultColor, 1.0);
    } 
    // ZUSTAND 2: RayGen ist implementiert (Richtung != 0), aber Loop fehlt noch (Sentinel -1)
    // Wir zeigen die Ray-Origin als Debug-Farbe.
    else if (length(rayDirection) > 0.0) {
        fragColor = vec4(rayOrigin * 0.5 + 0.5, 1.0);
    } 
    // ZUSTAND 1: Startzustand
    else {
        fragColor = vec4(vUv * 0.5 + 0.5, 0.0, 1.0); 
    }
}
```