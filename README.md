## Shader transform controls

Teaching shaders opt into gizmos through `// @control` annotations. The shared
binding in `src/lib/utils/shaderTransforms.ts` uses annotations rather than lesson
IDs or fixed uniform names:

```glsl
// @control pivot=true pivotOffset=meshOffset default=0,0,0
uniform vec3 pivot;
// @control hidden=true default=0,0,0
uniform vec3 meshOffset;
// @control transform=translate readonly=true
uniform mat4 translation;
// @control transform=rotate readonly=true
uniform mat4 rotation;
// @control transform=scale readonly=true
uniform mat4 scaling;
```

The shader owns the vertex calculation:

```glsl
vec3 localPosition = (rotation * scaling * vec4(position + meshOffset, 1.0)).xyz;
vec4 transformedPosition = translation * vec4(pivot + localPosition, 1.0);
```

`pivot=true` places the gizmo at the pivot plus translation. `pivotOffset` names
the vec3 uniform holding the mesh's position relative to that pivot. When the
pivot is edited, the shared binding rebases this offset using the inverse of
rotation and scale, preserving the mesh without altering the local T/R/S controls.
This edit requires invertible scale. Starting from identity transforms, the offset
is the negative pivot, giving `pivot + R * S * (position - pivot)`.

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
