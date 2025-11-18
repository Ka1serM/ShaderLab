---
category: Computer Animation
type: 2D
inputs:
  - name: volumeTexture
    type: texture3D
    value: textures/CTVolumeAtlas.raw

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
uniform ivec2 iResolution;

const float stepSize = 0.00256;
const int   maxSteps = 512;
const vec3  lightDir = normalize(vec3(1.0, 1.0, 0.0));
const float orthoScale = 0.5;

vec3 ComputeGradient(vec3 UVW) {
    vec3 H = 1.0 / vec3(textureSize(volumeTexture, 0)); // Texelgröße

    float Fx1 = texture(volumeTexture, clamp(UVW + vec3(H.x, 0.0, 0.0), 0.0, 1.0)).r;
    float Fx2 = texture(volumeTexture, clamp(UVW - vec3(H.x, 0.0, 0.0), 0.0, 1.0)).r;

    float Fy1 = texture(volumeTexture, clamp(UVW + vec3(0.0, H.y, 0.0), 0.0, 1.0)).r;
    float Fy2 = texture(volumeTexture, clamp(UVW - vec3(0.0, H.y, 0.0), 0.0, 1.0)).r;

    float Fz1 = texture(volumeTexture, clamp(UVW + vec3(0.0, 0.0, H.z), 0.0, 1.0)).r;
    float Fz2 = texture(volumeTexture, clamp(UVW - vec3(0.0, 0.0, H.z), 0.0, 1.0)).r;

    vec3 grad = vec3(
        (Fx1 - Fx2) / (2.0 * H.x),
        (Fy1 - Fy2) / (2.0 * H.y),
        (Fz1 - Fz2) / (2.0 * H.z)
    );
    return grad;
}

vec4 TransferFunction(float F, float gradientMagnitude)
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
    if (F <= huAir) {
        alpha = alphaAir;
        color = colorAir;
    } 
    else if (F < huTissue) {
        float t = (F - huAir) / (huTissue - huAir);
        alpha = mix(alphaAir, alphaTissue, t);
        color = mix(colorAir, colorTissue, t);
    } 
    else if (F < huBone) {
        float t = (F - huTissue) / (huBone - huTissue);
        alpha = mix(alphaTissue, alphaBone, t);
        color = mix(colorTissue, colorBone, t);
    } 
    else {
        alpha = alphaBone;
        color = colorBone;
    }

    // Gewichtung mit Gradient um die Kanten zwischen Oberflächen deutlich zu machen
    alpha *= 1.0 - exp(-5.0 * clamp(gradientMagnitude / 8.0, 0.0, 1.0)); // 0 -> flat region, 1 -> sharp edge

    return vec4(color, alpha);
}

vec3 PhongShade(vec3 N, vec3 BaseColor, vec3 ViewDir, vec3 lightDir) {
    const vec3 Ka = vec3(0.0); // Ambient
    const vec3 Kd = vec3(1.0); // Diffus
    const vec3 Ks = vec3(0.3); // Spekular
    const float NExp = 128.0; // Rauheit

    vec3 H = normalize(ViewDir + lightDir); // Halfvector
    float Diff = max(dot(N, lightDir), 0.0); // Diffus
    float Spec = pow(max(dot(N, H), 0.0), NExp); // Spekular

    return BaseColor * (Ka + Kd * Diff) + Ks * Spec;
}

void GenerateRay(out vec3 rayOrigin, out vec3 rayDir) {
    float Aspect = float(iResolution.x) / float(iResolution.y); // Seitenverhältnis aus Uniform
    vec2 UV = vUv;
    UV.x *= Aspect; // Korrigiert X-Skalierung

    // Orthogonale Basis bilden
    vec3 forward = normalize(cameraDirection);
    vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(right, forward);

    rayDir = forward;
    rayOrigin = cameraPosition + UV.x * right * orthoScale + UV.y * up * orthoScale; // Ortho Offset
}

vec4 SampleVolume(vec3 UVW, vec3 rayDir) {
    float F = texture(volumeTexture, UVW).r - 1100.0; // HU-Korrektur weil Textur Werte um 1100 angehoben
    vec3 Grad = ComputeGradient(UVW); // Gradient berechnen für Phong Normale
    float gradientMagnitude = length(Grad);

    vec4 Mat = TransferFunction(F, gradientMagnitude); // Materialdaten
    vec3 Shaded = PhongShade(normalize(-Grad), Mat.rgb, normalize(-rayDir), lightDir); // Beleuchtung

    return vec4(Shaded, Mat.a); // Farbe + alpha
}

void main() {
    vec3 rayOrigin, rayDir;
    GenerateRay(rayOrigin, rayDir);

    vec3 ColorAccum = vec3(0.0);
    float alphaAccum = 0.0;

    int Steps = min(int(1.0 / stepSize), maxSteps);

    for (int I = Steps - 1; I >= 0; --I) {     // Back-to-front
        float T = float(I) * stepSize;
        vec3 P = rayOrigin + rayDir * T;
        vec3 UVW = P + 0.5;

        if (UVW.x < 0.0 || UVW.y < 0.0 || UVW.z < 0.0 || UVW.x > 1.0 || UVW.y > 1.0 || UVW.z > 1.0)
            continue;

        vec4 S = SampleVolume(UVW, rayDir);
        ColorAccum = S.rgb * S.a + ColorAccum * (1.0 - S.a);
        alphaAccum = S.a + alphaAccum * (1.0 - S.a);
    }

    fragColor = vec4(ColorAccum, 1.0);
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