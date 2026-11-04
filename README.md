# ShaderLab

How to write your own **tasks** and **teaching** pages.

```sh
npm install && npm run dev
```

## Files

| Kind | File | URL |
| --- | --- | --- |
| Task | `src/content/tasks/<name>.md` | `/task/<name>` |
| Teaching | `src/content/teaching/<name>.md` | `/teach/<name>` |

Add the filename to `index.txt` in the same folder, or the page won't show up. The order in that file is the order in the app. Models go in `static/models/`, textures in `static/textures/`.

## Layout

YAML front matter, then `# Section` headings. Sections hold Markdown with KaTeX math (`$...$`). A shader section holds exactly one ` ```glsl ` block.

**Task sections:** `Task`, `Theory`, `Hints` (one `## Hint` per hint), `Starter Vertex|Fragment|Compute Shader`, `Reference Vertex|Fragment|Compute Shader`.

- The reference vertex and fragment shaders are required.
- `shaderStages` lists the stages the student edits, and each of those needs a starter shader. Every other stage runs its reference shader.
- A compute stage exists only if there is a `Reference Compute Shader`.

**Teaching sections:** `Overview`, `Explanation`, `Vertex Shader`, `Fragment Shader`. Here `shaderStages` lists the stages shown in the editor.

~~~markdown
---
title: Lambert
category: Illumination
shaderStages: [fragment]
scenes:
  - objects:
      - source: models/HeadDavid.glb
---

# Task
What to do.

# Hints
## Hint
First hint.

# Starter Fragment Shader
```glsl
...
```

# Reference Vertex Shader
```glsl
...
```

# Reference Fragment Shader
```glsl
...
```
~~~

## Front matter

```yaml
title: Lambert
category: Illumination
shaderStages: [vertex, fragment]   # vertex | fragment | compute
showTimeControl: true              # play/pause for `time`
simulation: { stepsPerFrame: 12 }  # compute tasks only
camera:                            # tasks only
  position: [2.5, 2.5, 2.5]
  target: [0, 0, 0]
  fov: 30
scenes:                            # several scenes → scene switcher
  - label: Teapot
    background: [0.1, 0.1, 0.1]
    frameBox: [[-1, -1, -1], [1, 1, 1]]
    objects:
      - source: models/Teapot.glb
        position: [0, 0, 0]
        rotation: [0, 0, 0]
        scale: [1, 1, 1]
        instanceCount: 3           # use gl_InstanceID
        wireframe: true
        lineWidth: 5
overlays:
  infiniteGrid: false              # default true
  viewHelper: false                # default true
  orbitControls: false             # default true
  normals: true                    # normal arrows
  insetView: true                  # second small view, see uInsetView
inputs:
  - name: volumeTexture            # uniform sampler3D volumeTexture;
    type: texture3D                # texture2D (png/jpg) | texture3D (.rawz)
    init: textures/CTVolumeAtlas.rawz
presets:                           # teaching only: buttons that set controls
  - name: Shiny
    values: { uShininess: 128 }
```

## Shaders

Write GLSL ES 3.00 without `#version` and `precision`, which are added for you. Available attributes: `in vec3 position; in vec3 normal; in vec2 uv;`.

**Built-in uniforms.** Declare them and the renderer fills them in:

| Uniform | |
| --- | --- |
| `mat4 modelMatrix, viewMatrix, projectionMatrix, modelViewMatrix` | |
| `mat3 normalMatrix` | |
| `vec3 cameraPosition, cameraDirection` · `float cameraFov` | fov in radians |
| `float time` | seconds |
| `vec2 iResolution` · `vec3 iMouse` | pixels, `iMouse.z > 0.5` = pressed |
| `bool uWireframe` · `float uWireframeLineWidth` · `int uObjectIndex` | per object |
| `bool uInsetView` | true while the inset view draws (aspect from `uniform float uAspect`, else the viewport's) |
| compute: `int frame`, `float deltaTime`, `vec2 pointerPosition, pointerVelocity`, `bool pointerInside, pointerDown` | pointer in −1…1 |

Any other uniform gets its value from an `@control`.

**Hidden code.** Code between two `// @prefix` lines or two `// @suffix` lines is compiled but hidden from the editor:

```glsl
// @prefix
out vec4 fragColor;
// @prefix
void shade() { /* student code */ }
// @suffix
void main() { shade(); }
// @suffix
```

## Annotations

A comment directly above a declaration, with attributes written as `{ key: value }`. Mistakes show up as errors on that line.

### `@control`: uniform → UI control

```glsl
// @control { label: Shininess, min: 1, max: 256, step: 1, default: 32 }
uniform float uShininess;
// @control { display: color, default: [0.5, 0.5, 0.5] }
uniform vec3 uKd;
// @control { visualize: point, default: [0, 1, 2] }
uniform vec3 uLightPosition;
// @control { options: [Center, Left], default: 0 }
uniform int uPivot;
```

The widget depends on the type: `float`/`int` → slider, `bool` → checkbox, `vec3`/`vec4` → number fields, `mat4` → matrix (16 numbers, column-major).

| Attribute | Type | |
| --- | --- | --- |
| `label`, `default`, `hidden`, `readonly` | any | |
| `min`, `max`, `step` | numbers | slider range |
| `display: color` | `vec3` | color picker |
| `visualize: point \| vector` | `vec3` | draggable point or arrow in the viewport |
| `options: [A, B]` | `int` | toggle, value = index |
| `transform: translate \| rotate \| scale` | `mat4` | the viewport gizmo writes this matrix |
| `pivot: name` | translate `mat4` | the gizmo sits at this `vec3` |
| `object: n` | transform `mat4` | applies only to scene object `n` |

The gizmo only writes the matrices. The shader applies them itself:

```glsl
// @control { transform: translate, pivot: pivotPoint, readonly: true }
uniform mat4 uTranslation;
// @control { transform: rotate, readonly: true }
uniform mat4 uRotation;
```

### `@readback`: show a value computed in the vertex shader

Goes above a local `float`/`vec3`/`vec4`/`mat4` inside `main`. Its value for the first vertex appears in the panel. Attributes: `label`, `min`, `max`, `step`, `hidden`, `visualize` (a visualized readback without a `label` only shows in the viewport).

```glsl
// @readback { label: Projection matrix P }
mat4 P = ...;
```

## Compute shaders

A compute shader runs once per element, every step. It reads the **old** state of all elements and writes the **new** state of its own.

- One state type: a `struct` of `float`/`vec2`/`vec3`/`vec4` (max 16 floats), or a plain `float`/`vecN`.
- Exactly one `uniform` array of that type. Its size is the element count.
- Exactly one `out` of that type.
- `flat in int index` is the current element. `frame == 0` is the first step, so set the start state there.

```glsl
struct Particle { vec2 position; vec2 velocity; };
uniform Particle particles[1024];
flat in int index;
out Particle particle;
uniform int frame;
uniform float deltaTime;

void main() {
    particle = particles[index];
    if (frame == 0) { particle.position = vec2(index % 32, index / 32) * 0.05; return; }
    particle.velocity += vec2(0.0, -9.81) * deltaTime;
    particle.position += particle.velocity * deltaTime;
}
```

To draw the state, declare the same struct and array in the vertex or fragment shader. Usually you draw one instance per element (`instanceCount: 1024`):

```glsl
uniform Particle particles[1024];
void main() {
    Particle p = particles[gl_InstanceID];
    gl_Position = vec4(p.position + position.xy * 0.03, 0.0, 1.0);
}
```

Each frame runs `stepsPerFrame` compute steps (`deltaTime = 1/60 / stepsPerFrame`), then draws the scene with the vertex and fragment shaders. A reset starts again at `frame = 0`.
