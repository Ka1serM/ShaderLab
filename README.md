## Shader transform controls

Teaching shaders opt into gizmos through `// @control` annotations. The shared
binding in `src/lib/utils/shaderTransforms.ts` uses annotations rather than lesson
IDs or fixed uniform names:

```glsl
// @control default=0,0,0
uniform vec3 pivot;
// @control transform=translate pivot=pivot readonly=true
uniform mat4 translation;
// @control transform=rotate readonly=true
uniform mat4 rotation;
// @control transform=scale readonly=true
uniform mat4 scaling;
```

The shader owns the vertex calculation:

```glsl
vec3 localPosition = (rotation * scaling * vec4(position - pivot, 1.0)).xyz;
vec4 transformedPosition = translation * vec4(pivot + localPosition, 1.0);
```

`pivot=<uniform>` on the translate control names a vec3 uniform and places the
gizmo at `translation * pivot`. It only affects gizmo placement; the pivot is an
ordinary uniform with no CPU-side compensation, so moving it after rotating or
scaling moves the mesh exactly as the shader math says.

An optional draggable point uses the existing readback annotations:

```glsl
// @readback visualize=point target=pivot inverse=translation
vec3 pivotWorld = (translation * vec4(pivot, 1.0)).xyz;
```

Only the editor interaction keeps state on the CPU; vertex transformation stays
in GLSL. Shaders without pivot annotations retain ordinary T/R/S gizmos.

## License

ShaderLab is licensed under the **PolyForm Noncommercial License 1.0.0**.

- Educational institutions may self-host for internal, non-commercial use.
- Public hosting or commercial use requires a paid license from the copyright holder.
- See LICENSE file for full details.
