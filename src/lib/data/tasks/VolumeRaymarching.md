---
category: Computer Animation
type: 2D
inputs:
  - name: volumeTexture
    type: texture3D
    init: textures/CTVolumeAtlas.raw
title: Volumetric Raymarching
hints:
  - Berechne für jedes Pixel die Rayrichtung aus Kameraposition und Blickrichtung (orthographisch).
  - Inkrementiere den Ray schrittweise von hinten und akkumuliere Farbe und Opacity (Back-to-Front Compositing).
---

# Task
Die Studierenden lernen, wie man **CT-Volumendaten** mittels Direct Volume Rendering visualisiert.
Der implementierte Shader basiert auf der Arbeit von Marc Levoy (1988) und demonstriert:

- Volume Rendering Pipeline:
  - Ray Generation (Orthographische Projektion)
  - Sampling entlang des Rays
- Transfer Function & Classification:
  - HU-Werte zu Farbe und Opacity
  - Gradientenbasierte Opacity-Modulation
- Shading & Compositing:
  - Gradient-Berechnung für Normalen
  - Phong Shading
  - Back-To-Front Alpha Compositing

# Theory

## Display of Surfaces from Volume Data (Levoy 1988)

Nach Levoy besteht die Volume Rendering Pipeline aus den folgenden Schritten:

1. **Data Preparation**  
   Korrektur und Interpolation der Rohdaten:  
   $$
   f_0(x_i) \rightarrow f_1(x_i)
   $$

2. **Shading**  
   Berechnung der Voxel-Farben:  
   $$
   c_\lambda(x_i)
   $$

3. **Classification**  
   Bestimmung der Voxel-Opazitäten mittels Transfer Function:  
   $$
   \alpha(x_i)
   $$

4. **Resampling**  
   Interpolation der volumetrischen Daten entlang des Strahls.

5. **Compositing**  
   Farbakkumulation entlang des Strahls (Back-to-Front) mittels Over-Operator:  
   $$
   C_{\text{out},\lambda} = C_{\text{in},\lambda}(1 - \alpha) + c_\lambda \alpha
   $$  
   Für Back-to-Front Compositing:  
   $$
   C_\lambda(u_i) = \sum_{k=0}^{K} c_\lambda(x_k) \alpha(x_k) \prod_{m=k+1}^{K} (1 - \alpha(x_m))
   $$

---

## Transfer Function & Classification

Die Transfer Function ordnet CT-Werte (Hounsfield Units, HU) Farbe und Opazität zu:

$$
\begin{aligned}
\text{Luft: } & \approx -1000 \text{ HU} \\
\text{Wasser: } & 0 \text{ HU} \\
\text{Weichgewebe: } & +30 \text{ bis } +70 \text{ HU} \\
\text{Knochen: } & +700 \text{ bis } +3000 \text{ HU}
\end{aligned}
$$

Die finale Opazität wird häufig mit dem Gradienten verstärkt, um Oberflächen hervorzuheben:  
$$
\alpha_{\text{final}}(x_i) = \text{clamp}\big(\|\nabla f(x_i)\| \cdot k_{\text{boost}} \cdot \alpha_{\text{base}}(x_i)\big)
$$

---

## Gradient Computation & Shading

### Gradient Approximation (Central Difference)
$$
\nabla f(x_i) \approx \frac{1}{2h} 
\begin{pmatrix}
f(x_{i+1},y_j,z_k) - f(x_{i-1},y_j,z_k) \\
f(x_i,y_{j+1},z_k) - f(x_i,y_{j-1},z_k) \\
f(x_i,y_j,z_{k+1}) - f(x_i,y_j,z_{k-1})
\end{pmatrix}
$$

Normale:
$$
\mathbf{N}(x_i) = \frac{\nabla f(x_i)}{\|\nabla f(x_i)\|}
$$

### Phong Shading
$$
c_\lambda(x_i) = c_{p,\lambda} k_{a,\lambda} + 
\frac{c_{p,\lambda}}{k_1 + k_2 d(x_i)} \Big[ k_{d,\lambda} (\mathbf{N} \cdot \mathbf{L}) + k_{s,\lambda} (\mathbf{N} \cdot \mathbf{H})^n \Big]
$$

Komponenten:
- $c_{p,\lambda}$: Lichtfarbe  
- $k_{a,\lambda}$: Ambient Koeffizient  
- $k_{d,\lambda}$: Diffuse Koeffizient  
- $k_{s,\lambda}$: Specular Koeffizient  
- $n$: Specular Exponent  
- $\mathbf{L}$: Lichtrichtung  
- $\mathbf{H} = \frac{\mathbf{V} + \mathbf{L}}{\|\mathbf{V} + \mathbf{L}\|}$: Half-Vector  
- $\mathbf{V}$: View-Richtung  
- $d(x_i)$: optionale Tiefenabhängigkeit

---

# Literatur

- Levoy, M. (1988). *Display of Surfaces from Volume Data.* IEEE Computer Graphics and Applications, 8(3), 29-37.  
- Phong, B. T. (1975). *Illumination for Computer Generated Pictures.* Communications of the ACM, 18(6), 311-317.  
- Drebin, R. A., Carpenter, L., & Hanrahan, P. (1988). *Volume Rendering.* SIGGRAPH '88 Proceedings, 65-74.

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
uniform ivec2 iResolution; // <-- aspect correction

const float stepSize = 0.005;
const int   maxSteps = 1024;
const vec3  lightDir = normalize(vec3(1.0, 1.0, 0.0));
const float orthoScale = 0.5;

// Gradient computation
vec3 computeGradient(vec3 uvw) {
    float h = 0.005;
    float fx1 = texture(volumeTexture, clamp(uvw + vec3(h,0,0), 0.0, 1.0)).r;
    float fx2 = texture(volumeTexture, clamp(uvw - vec3(h,0,0), 0.0, 1.0)).r;
    float fy1 = texture(volumeTexture, clamp(uvw + vec3(0,h,0), 0.0, 1.0)).r;
    float fy2 = texture(volumeTexture, clamp(uvw - vec3(0,h,0), 0.0, 1.0)).r;
    float fz1 = texture(volumeTexture, clamp(uvw + vec3(0,0,h), 0.0, 1.0)).r;
    float fz2 = texture(volumeTexture, clamp(uvw - vec3(0,0,h), 0.0, 1.0)).r;
    return -vec3(fx1 - fx2, fy1 - fy2, fz1 - fz2);
}

// Transfer function
vec4 transferFunction(float f, float gradMag) {
    // Representative CT numbers (HU)
    const float f_air    = -750.0;
    const float f_tissue =   50.0;
    const float f_bone   =  700.0;

    // Assigned alpha values (Opacity)
    const float a_air    = 0.0;  // Transparent
    const float a_tissue = 0.2;  // Medium opacity
    const float a_bone   = 1.0;  // Strong opacity

    // Assigned colors
    const vec3 c_air    = vec3(0.0);                 // Air
    const vec3 c_tissue = vec3(0.9, 0.7, 0.6);   // Skin-tone
    const vec3 c_bone   = vec3(1.0, 1.0, 0.95);  // White/Ivory
    
    // initial
    float alpha = 0.0;
    vec3  color = c_air;

    if (f >= f_air && f <= f_tissue) {
        // Between air and soft tissue
        float t = (f - f_air) / (f_tissue - f_air);
        alpha = mix(a_air, a_tissue, t);
        color = mix(c_air, c_tissue, t);
    } else if (f >= f_tissue && f <= f_bone) {
        // Between tissue and bone
        float t = (f - f_tissue) / (f_bone - f_tissue);
        alpha = mix(a_tissue, a_bone, t);
        color = mix(c_tissue, c_bone, t);
    } else if (f > f_bone) {
        // Denser than bone
        alpha = a_bone;
        color = c_bone;
    }

    // Multiply opacity by gradient magnitude
    // alpha = clamp(alpha * gradMag * 2.0, 0.0, 1.0);

    return vec4(color, alpha);
}


// Phong shading
vec3 phongShade(vec3 N, vec3 baseColor, vec3 viewDir, vec3 lightDir) {
    const vec3 ka = vec3(0.5);
    const vec3 kd = vec3(0.6);
    const vec3 ks = vec3(0.3);
    const float n = 20.0;

    vec3 H = normalize(viewDir + lightDir);
    float diff = max(dot(N, lightDir), 0.0);
    float spec = pow(max(dot(N, H), 0.0), n);

    return baseColor * (ka + kd * diff) + ks * spec;
}

// Ray generation (aspect-corrected)
void generateRay(out vec3 rayOrigin, out vec3 rayDir) {
    // compute aspect ratio from iResolution
    float aspect = float(iResolution.x) / float(iResolution.y);

    // If vUv is already in -1..1, you may not want to remap; here we follow the existing use
    // and simply scale the X component to correct for aspect.
    vec2 uv = vUv;
    uv.x *= aspect;

    vec3 forward = normalize(cameraDirection);
    vec3 right   = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
    vec3 up      = cross(right, forward);

    rayDir = forward;
    // scale the right offset by the corrected uv.x
    rayOrigin = cameraPosition + uv.x * right * orthoScale + uv.y * up * orthoScale;
}

// Sample volume
vec4 sampleVolume(vec3 uvw, vec3 rayDir) {
    float f = texture(volumeTexture, uvw).r - 1100.0; // texture is raised by 1100
    vec3 grad = computeGradient(uvw);
    float gradMag = length(grad);

    // Call transfer function to get material properties
    vec4 material = transferFunction(f, gradMag);
    
    vec3 shaded = phongShade(normalize(grad), material.rgb, normalize(-rayDir), lightDir);

    return vec4(shaded, material.a);
}

void main() {
    vec3 rayOrigin, rayDir;
    generateRay(rayOrigin, rayDir);

    float tNear = 0.01; // Start slightly away from the camera
    float tFar  = 2.0;  // March a distance guaranteed to pass through the volume

    vec3 colorAccum = vec3(0.0);
    float alphaAccum = 0.0;

    // Calculate number of steps based on the assumed marching length
    float rayLength = tFar - tNear;
    int steps = min(int(rayLength / stepSize), maxSteps);

    // Ray marching loop
    // Back-to-front compositing
    for (int i = steps - 1; i >= 0; --i) {
        float t = tNear + float(i) * stepSize;
        vec3 p = rayOrigin + rayDir * t;
        vec3 uvw = p + 0.5;

        // Bounding box check (to ensure we only sample the texture)
        // This acts as an implicit boundary for the volume.
        if (any(lessThan(uvw, vec3(0.0))) || any(greaterThan(uvw, vec3(1.0))))
            continue;

        vec4 s = sampleVolume(uvw, rayDir);
        float a = s.a;
        vec3 c = s.rgb;

        // 'Over' operator
        colorAccum = c * a + colorAccum * (1.0 - a);
        alphaAccum = a + alphaAccum * (1.0 - a);
    }

    fragColor = vec4(colorAccum, 1.0);
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