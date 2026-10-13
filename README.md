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

`pivot=<name>` on the translate control names a vec3 uniform or a vec3 readback
and places the gizmo at `translation * pivot`. It only affects gizmo placement;
there is no CPU-side compensation, so changing the pivot after rotating or
scaling moves the mesh exactly as the shader math says.

A shader can also derive the pivot, for example from fixed choices. An `int`
uniform with `options` shows a segmented toggle and holds the selected index:

```glsl
// @control label="Pivot" options="Center,Right"
uniform int pivotChoice;
// @control transform=translate pivot=pivot readonly=true
uniform mat4 translation;

void main() {
  // @readback label="Pivot P"
  vec3 pivot = pivotChoice == 0 ? vec3(0.0) : vec3(1.0, 0.0, 0.0);
  // @readback visualize=point
  vec3 pivotWorld = (translation * vec4(pivot, 1.0)).xyz;
  ...
}
```

Add `target=pivot inverse=translation` to the point readback to make a pivot
uniform draggable in the viewport.

Only the editor interaction keeps state on the CPU; vertex transformation stays
in GLSL. Shaders without pivot annotations retain ordinary T/R/S gizmos.

## License

ShaderLab is licensed under the **PolyForm Noncommercial License 1.0.0**.

- Educational institutions may self-host for internal, non-commercial use.
- Public hosting or commercial use requires a paid license from the copyright holder.
- See LICENSE file for full details.
