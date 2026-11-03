---
category: Simulation
title: Partikel-Fluid
shaderStages:
  - compute
simulation:
  stepsPerFrame: 4
camera:
  position: [0, 0, 10]
  target: [0, 0, 0]
  fov: 30
scenes:
  - frameBox: [[-2.1, -1.5, 0], [2.1, 1.5, 0]]
    objects:
      - source: models/Canvas.glb
        instanceCount: particles
      - source: models/Canvas.glb
        position: [0, 0, -0.01]
        scale: [2, 1.4, 1]
overlays:
  infiniteGrid: false
  viewHelper: false
  orbitControls: false
---

# Task
Simuliere eine Flüssigkeit aus 1024 Partikeln in einem Becken. Zu Beginn steht das Wasser als Block in der linken Ecke und fällt in sich zusammen („Dammbruch“). Mit gedrückter Maustaste rührst du in der Vorschau durch das Wasser.

Der Compute-Shader berechnet in `update(i)` den nächsten Zustand von Partikel `i`. Schwerkraft und Beckenwände sind bereits vorhanden; ohne Druck fallen alle Partikel aber in eine einzige Schicht am Boden.

1. **Dichte:** Bestimme für jedes Partikel die Dichte `density` und die Nahdichte `nearDensity` aus allen Nachbarn im Radius `H`. Mit $q = 1 - r/H$ ist die Dichte $\sum q^2$ und die Nahdichte $\sum q^3$. Speichere beide Werte für den nächsten Schritt.
2. **Druck:** Berechne daraus den Druck $P = k\,(\rho - \rho_0)$ und den Nahdruck $P_{near} = k_{near}\,\rho_{near}$. Jeder Nachbar schiebt das Partikel entlang der Verbindungsrichtung weg, mit dem Mittelwert der beiden Drücke, gewichtet mit $q$ (Druck) bzw. $q^2$ (Nahdruck).
3. **Viskosität:** Gleiche die Geschwindigkeit an die der Nachbarn an, gewichtet mit $q$. Das Wasser beruhigt sich dann, statt endlos zu zittern.
4. **Rühren:** Solange `pointerDown` gilt, sollen Partikel in der Nähe von `pointerPosition` die Bewegung des Mauszeigers `pointerVelocity` übernehmen.

Vergleiche dein Ergebnis mit der Referenz links. Der Neustart-Knopf im Kopf der Vorschau setzt beide Simulationen auf `init(i)` zurück; mit dem Schritt-Knopf kannst du die Simulation Bild für Bild verfolgen.

# Hints

## Hint
Du darfst den Zustand jedes Partikels lesen, aber nur den eigenen schreiben. Die Dichte eines Nachbarn liest du deshalb aus dem letzten Schritt – genau dafür wird sie im Partikel gespeichert.

## Hint
Die Verbindungsrichtung vom Nachbarn zu dir ist `(self.position - other.position) / r`. Überspringe Nachbarn mit `r >= H` und das Partikel selbst.

# Theory
## Compute-Shader in ShaderLab
Ein Compute-Shader rechnet nicht pro Pixel, sondern pro Element eines Puffers. Die erste Zeile legt den Puffer fest, darauf folgt der Typ eines Elements:

```glsl
// @buffer particles count=1024
struct Particle {
    vec2 position;
    vec2 velocity;
};
```

Daraus entstehen automatisch die Funktion `Particle particles(int i)`, die Element `i` liest, die Funktion `write(Particle p)`, die den neuen Zustand des eigenen Elements speichert, und die Konstante `particlesCount`. Ein Element darf höchstens 16 Floats enthalten (`float`, `vec2`, `vec3` und `vec4`).

Du schreibst zwei Funktionen: `Particle init(int i)` liefert den Startzustand, `void update(int i)` berechnet einen Simulationsschritt. Alle Elemente lesen dabei den Zustand vor dem Schritt, so dass die Reihenfolge der Berechnung keine Rolle spielt. Ohne Aufruf von `write` bleibt ein Element unverändert.

Ohne Deklaration stehen zur Verfügung: `deltaTime` (Dauer des Schritts in Sekunden), `time`, `pointerPosition` und `pointerVelocity` (Mauszeiger in Weltkoordinaten auf der Ebene $z = 0$) sowie `pointerDown`. Pro Bild laufen vier Schritte; der Vertex-Shader zeichnet anschließend ein Quadrat pro Partikel.

## Partikelbasierte Flüssigkeiten
Statt Druck auf einem Gitter zu lösen, schätzt jedes Partikel die Dichte aus seinen Nachbarn. Ist sie höher als die Ruhedichte $\rho_0$, drücken sich die Partikel auseinander; ist sie niedriger, ziehen sie sich leicht an – das wirkt wie Oberflächenspannung. Der Nahdruck ist immer abstoßend und verhindert, dass Partikel zusammenklumpen (Clavet et al., *Particle-based Viscoelastic Fluid Simulation*, 2005).

# Starter Compute Shader
```glsl
// @buffer particles count=1024
struct Particle {
    vec2 position;
    vec2 velocity;
    float density;
    float nearDensity;
};

const vec2 BASIN = vec2(2.0, 1.4);   // halbe Breite und Höhe des Beckens
const vec2 GRAVITY = vec2(0.0, -6.0);
const float H = 0.12;                 // Wechselwirkungsradius
const float REST_DENSITY = 2.0;
const float STIFFNESS = 300.0;
const float NEAR_STIFFNESS = 400.0;
const float VISCOSITY = 8.0;
const float STIR_RADIUS = 0.35;

Particle init(int i) {
    Particle p;
    p.position = vec2(-1.9, -1.35) + vec2(float(i % 32), float(i / 32)) * 0.05;
    p.velocity = vec2(0.0);
    p.density = REST_DENSITY;
    p.nearDensity = 0.0;
    return p;
}

void update(int i) {
    Particle self = particles(i);
    vec2 acceleration = GRAVITY;

    // TODO: Dichte, Druck und Viskosität aus allen Nachbarn (particles(j), j < particlesCount)

    // TODO: Rühren mit pointerDown, pointerPosition und pointerVelocity

    self.velocity += acceleration * deltaTime;
    self.position += self.velocity * deltaTime;

    // Beckenwände: zurücksetzen und abprallen
    if (abs(self.position.x) > BASIN.x) {
        self.position.x = sign(self.position.x) * BASIN.x;
        self.velocity.x *= -0.3;
    }
    if (abs(self.position.y) > BASIN.y) {
        self.position.y = sign(self.position.y) * BASIN.y;
        self.velocity.y *= -0.3;
    }

    write(self);
}
```

# Reference Compute Shader
```glsl
// @buffer particles count=1024
struct Particle {
    vec2 position;
    vec2 velocity;
    float density;
    float nearDensity;
};

const vec2 BASIN = vec2(2.0, 1.4);
const vec2 GRAVITY = vec2(0.0, -6.0);
const float H = 0.12;
const float REST_DENSITY = 2.0;
const float STIFFNESS = 300.0;
const float NEAR_STIFFNESS = 400.0;
const float VISCOSITY = 8.0;
const float STIR_RADIUS = 0.35;
const float MAX_SPEED = 8.0;

Particle init(int i) {
    Particle p;
    p.position = vec2(-1.9, -1.35) + vec2(float(i % 32), float(i / 32)) * 0.05;
    p.velocity = vec2(0.0);
    p.density = REST_DENSITY;
    p.nearDensity = 0.0;
    return p;
}

void update(int i) {
    Particle self = particles(i);
    float pressure = STIFFNESS * (self.density - REST_DENSITY);
    float nearPressure = NEAR_STIFFNESS * self.nearDensity;

    vec2 acceleration = GRAVITY;
    float density = 0.0;
    float nearDensity = 0.0;
    for (int j = 0; j < particlesCount; j++) {
        if (j == i) continue;
        Particle other = particles(j);
        vec2 offset = self.position - other.position;
        float r = length(offset);
        if (r >= H || r < 1e-6) continue;
        float q = 1.0 - r / H;
        density += q * q;
        nearDensity += q * q * q;

        // Druck aus dem letzten Schritt: der eigene und der des Nachbarn zu gleichen Teilen.
        float otherPressure = STIFFNESS * (other.density - REST_DENSITY);
        float otherNearPressure = NEAR_STIFFNESS * other.nearDensity;
        vec2 direction = offset / r;
        acceleration += direction * (0.5 * (pressure + otherPressure) * q + 0.5 * (nearPressure + otherNearPressure) * q * q);
        acceleration += (other.velocity - self.velocity) * VISCOSITY * q;
    }

    if (pointerDown) {
        float weight = 1.0 - distance(self.position, pointerPosition.xy) / STIR_RADIUS;
        if (weight > 0.0) self.velocity = mix(self.velocity, pointerVelocity.xy, weight * min(1.0, 12.0 * deltaTime));
    }

    self.velocity += acceleration * deltaTime;
    float speed = length(self.velocity);
    if (speed > MAX_SPEED) self.velocity *= MAX_SPEED / speed;
    self.position += self.velocity * deltaTime;

    if (abs(self.position.x) > BASIN.x) {
        self.position.x = sign(self.position.x) * BASIN.x;
        self.velocity.x *= -0.3;
    }
    if (abs(self.position.y) > BASIN.y) {
        self.position.y = sign(self.position.y) * BASIN.y;
        self.velocity.y *= -0.3;
    }

    self.density = density;
    self.nearDensity = nearDensity;
    write(self);
}
```

# Reference Vertex Shader
```glsl
precision highp float;

in vec3 position;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform int uObjectIndex;

out vec2 vCorner;
out float vSpeed;
flat out int vBasin;

void main() {
    vCorner = position.xy;
    vBasin = uObjectIndex;
    if (uObjectIndex == 1) {
        // Das Becken hinter den Partikeln
        vSpeed = 0.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        return;
    }
    Particle particle = particles(gl_InstanceID);
    vSpeed = length(particle.velocity);
    vec3 center = vec3(particle.position, 0.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(center + position * 0.035, 1.0);
}
```

# Reference Fragment Shader
```glsl
precision highp float;

in vec2 vCorner;
in float vSpeed;
flat in int vBasin;

out vec4 fragColor;

void main() {
    if (vBasin == 1) {
        vec2 edge = 1.0 - abs(vCorner);
        float border = step(min(edge.x, edge.y), 0.006);
        fragColor = vec4(mix(vec3(0.11, 0.12, 0.15), vec3(0.35, 0.38, 0.45), border), 1.0);
        return;
    }
    float r = length(vCorner);
    if (r > 1.0) discard;
    vec3 deep = vec3(0.06, 0.32, 0.78);
    vec3 foam = vec3(0.78, 0.92, 1.0);
    vec3 color = mix(deep, foam, clamp(vSpeed / 3.0, 0.0, 1.0));
    fragColor = vec4(color * (0.6 + 0.4 * sqrt(1.0 - r * r)), 1.0);
}
```
