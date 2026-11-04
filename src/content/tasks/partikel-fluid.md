---
category: Simulation
title: Partikel-Fluid
shaderStages:
  - compute
  - vertex
  - fragment
simulation:
  stepsPerFrame: 12
scenes:
  - background: [0.11, 0.12, 0.15]
    objects:
      - source: models/Canvas.glb
        instanceCount: 1024
overlays:
  infiniteGrid: false
  viewHelper: false
  orbitControls: false
---

# Task
Ergänze im Compute-Shader Dichte, Druck und Viskosität, sodass sich die 1024 Partikel wie eine Flüssigkeit verhalten. Vergleiche mit der Referenz.

# Hints

## Hint
Du darfst den Zustand jedes Partikels lesen, aber nur den eigenen schreiben. Die Dichte eines Nachbarn liest du deshalb aus dem letzten Schritt – genau dafür wird sie im Partikel gespeichert.

## Hint
Die Verbindungsrichtung vom Nachbarn zu dir ist `(particle.position - other.position) / r`. Überspringe Nachbarn mit `r >= H` und das Partikel selbst.

## Hint
`pointerPosition` und `pointerVelocity` sind in Bildschirmkoordinaten angegeben (−1 bis 1 auf beiden Achsen). Mit `* basin()` werden daraus Koordinaten im Becken.

# Theory
Der Compute-Shader berechnet pro Schritt den neuen Zustand `particle` von Partikel `index` aus dem alten Zustand aller Partikel `particles[j]`. Bei `frame == 0` wird der Startzustand gesetzt. Der Vertex-Shader zeichnet mit `particles[gl_InstanceID]` ein Quadrat pro Partikel.

# Starter Compute Shader
```glsl
struct Particle {
    vec2 position;
    vec2 velocity;
    float density;
    float nearDensity;
};

uniform Particle particles[1024]; // alle Partikel vor diesem Schritt
flat in int index;                // das Partikel, das dieser Durchlauf berechnet
out Particle particle;            // sein neuer Zustand

uniform int frame;                // Nummer des Schritts, 0 beim Start
uniform float deltaTime;          // Dauer eines Schritts in Sekunden
uniform vec2 iResolution;         // Größe der Vorschau in Pixeln
uniform vec2 pointerPosition;     // Mauszeiger, −1 bis 1 auf beiden Achsen
uniform vec2 pointerVelocity;     // seine Geschwindigkeit pro Sekunde
uniform bool pointerInside;
uniform bool pointerDown;

const vec2 GRAVITY = vec2(0.0, -6.0);
const float H = 0.12;                 // Wechselwirkungsradius
const float REST_DENSITY = 2.0;
const float STIFFNESS = 300.0;
const float NEAR_STIFFNESS = 400.0;
const float VISCOSITY = 16.0;
const float POINTER_RADIUS = 0.25;
const float POINTER_PUSH = 200.0;
const float MAX_SPEED = 8.0;

// Halbe Breite und Höhe des Beckens. Es füllt die Vorschau, die Breite folgt ihrem Seitenverhältnis.
vec2 basin() {
    return 1.4 * vec2(iResolution.x / iResolution.y, 1.0);
}

void main() {
    particle = particles[index];

    // Startzustand: ein Block in der linken unteren Ecke
    if (frame == 0) {
        particle.position = -basin() + vec2(0.1, 0.05) + vec2(float(index % 32), float(index / 32)) * 0.05;
        particle.velocity = vec2(0.0);
        particle.density = REST_DENSITY;
        particle.nearDensity = 0.0;
        return;
    }

    vec2 acceleration = GRAVITY;

    // TODO: Dichte, Druck und Viskosität aus allen Nachbarn (particles[j], j < particles.length())

    // TODO: Maus mit pointerInside, pointerDown, pointerPosition und pointerVelocity

    particle.velocity += acceleration * deltaTime;
    float speed = length(particle.velocity);
    if (speed > MAX_SPEED) particle.velocity *= MAX_SPEED / speed;
    particle.position += particle.velocity * deltaTime;

    // Beckenwände: zurücksetzen und abprallen
    vec2 walls = basin();
    if (abs(particle.position.x) > walls.x) {
        particle.position.x = sign(particle.position.x) * walls.x;
        particle.velocity.x *= -0.3;
    }
    if (abs(particle.position.y) > walls.y) {
        particle.position.y = sign(particle.position.y) * walls.y;
        particle.velocity.y *= -0.3;
    }

}
```

# Reference Compute Shader
```glsl
struct Particle {
    vec2 position;
    vec2 velocity;
    float density;
    float nearDensity;
};

uniform Particle particles[1024]; // alle Partikel vor diesem Schritt
flat in int index;                // das Partikel, das dieser Durchlauf berechnet
out Particle particle;            // sein neuer Zustand

uniform int frame;                // Nummer des Schritts, 0 beim Start
uniform float deltaTime;          // Dauer eines Schritts in Sekunden
uniform vec2 iResolution;         // Größe der Vorschau in Pixeln
uniform vec2 pointerPosition;     // Mauszeiger, −1 bis 1 auf beiden Achsen
uniform vec2 pointerVelocity;     // seine Geschwindigkeit pro Sekunde
uniform bool pointerInside;
uniform bool pointerDown;

const vec2 GRAVITY = vec2(0.0, -6.0);
const float H = 0.12;                 // Wechselwirkungsradius
const float REST_DENSITY = 2.0;
const float STIFFNESS = 300.0;
const float NEAR_STIFFNESS = 400.0;
const float VISCOSITY = 16.0;
const float POINTER_RADIUS = 0.25;
const float POINTER_PUSH = 200.0;
const float MAX_SPEED = 8.0;

// Halbe Breite und Höhe des Beckens. Es füllt die Vorschau, die Breite folgt ihrem Seitenverhältnis.
vec2 basin() {
    return 1.4 * vec2(iResolution.x / iResolution.y, 1.0);
}

void main() {
    particle = particles[index];

    // Startzustand: ein Block in der linken unteren Ecke
    if (frame == 0) {
        particle.position = -basin() + vec2(0.1, 0.05) + vec2(float(index % 32), float(index / 32)) * 0.05;
        particle.velocity = vec2(0.0);
        particle.density = REST_DENSITY;
        particle.nearDensity = 0.0;
        return;
    }

    float pressure = STIFFNESS * (particle.density - REST_DENSITY);
    float nearPressure = NEAR_STIFFNESS * particle.nearDensity;

    vec2 acceleration = GRAVITY;
    float density = 0.0;
    float nearDensity = 0.0;
    for (int j = 0; j < particles.length(); j++) {
        if (j == index) continue;
        Particle other = particles[j];
        vec2 offset = particle.position - other.position;
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
        acceleration += (other.velocity - particle.velocity) * VISCOSITY * q;
    }

    // Der Zeiger verdrängt das Wasser und nimmt es mit, wenn er sich bewegt.
    if (pointerInside) {
        vec2 offset = particle.position - pointerPosition * basin();
        float r = length(offset);
        float radius = pointerDown ? 2.0 * POINTER_RADIUS : POINTER_RADIUS;
        if (r < radius && r > 1e-6) {
            float weight = 1.0 - r / radius;
            acceleration += offset / r * weight * POINTER_PUSH;
            particle.velocity = mix(particle.velocity, pointerVelocity * basin(), weight * min(1.0, 12.0 * deltaTime));
        }
    }

    particle.velocity += acceleration * deltaTime;
    float speed = length(particle.velocity);
    if (speed > MAX_SPEED) particle.velocity *= MAX_SPEED / speed;
    particle.position += particle.velocity * deltaTime;

    // Beckenwände: zurücksetzen und abprallen
    vec2 walls = basin();
    if (abs(particle.position.x) > walls.x) {
        particle.position.x = sign(particle.position.x) * walls.x;
        particle.velocity.x *= -0.3;
    }
    if (abs(particle.position.y) > walls.y) {
        particle.position.y = sign(particle.position.y) * walls.y;
        particle.velocity.y *= -0.3;
    }

    particle.density = density;
    particle.nearDensity = nearDensity;
}
```

# Reference Vertex Shader
```glsl
in vec3 position;

uniform vec2 iResolution;

struct Particle {
    vec2 position;
    vec2 velocity;
    float density;
    float nearDensity;
};
uniform Particle particles[1024];

out vec2 vCorner;
out float vSpeed;

// Wie im Compute-Shader: halbe Breite und Höhe des Beckens.
vec2 basin() {
    return 1.4 * vec2(iResolution.x / iResolution.y, 1.0);
}

void main() {
    vCorner = position.xy;
    Particle particle = particles[gl_InstanceID];
    vSpeed = length(particle.velocity);
    // Ein Quadrat um das Partikel, vom Becken direkt in Bildschirmkoordinaten (−1 bis 1).
    gl_Position = vec4((particle.position + position.xy * 0.035) / basin(), 0.0, 1.0);
}
```

# Reference Fragment Shader
```glsl
in vec2 vCorner;
in float vSpeed;

out vec4 fragColor;

void main() {
    float r = length(vCorner);
    if (r > 1.0) discard;
    vec3 deep = vec3(0.06, 0.32, 0.78);
    vec3 foam = vec3(0.78, 0.92, 1.0);
    vec3 color = mix(deep, foam, clamp(vSpeed / 3.0, 0.0, 1.0));
    fragColor = vec4(color * (0.6 + 0.4 * sqrt(1.0 - r * r)), 1.0);
}
```
