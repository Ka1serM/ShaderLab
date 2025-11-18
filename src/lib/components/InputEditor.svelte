<script>
  import { onDestroy } from 'svelte';
  import { taskStore } from '$lib/stores/taskStore.js';

  import * as Checkbox from '$lib/components/ui/checkbox';
  import * as Slider from '$lib/components/ui/slider';
  import * as Input from '$lib/components/ui/input';
  import * as Label from '$lib/components/ui/label';
  import * as Collapsible from '$lib/components/ui/collapsible';

  let state = {};
  const unsubscribe = taskStore.subscribe((s) => (state = s));
  onDestroy(() => unsubscribe());

  function getValue(name, inp) {
    const param = state?.session?.inputs?.find((p) => p.name === name);
    if (param && param.value !== undefined) return param.value;
    if (inp.value !== undefined) return inp.value;
    if (inp.type && inp.type.startsWith && inp.type.startsWith('vec')) return Array(parseInt(inp.type.slice(3))).fill(0);
    if (inp.type === 'float' || inp.type === 'int') return 0;
    return null;
  }

  function setInputObj(inp, value) {
    const obj = { name: inp.name, type: inp.type, value };
    taskStore.setInput(obj);
  }

  function rgbToHex(arr) {
    if (!arr || arr.length < 3) return '#000000';
    return '#' + arr.slice(0, 3).map(x => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0')).join('');
  }

  function hexToRgbFloat(hex) {
    const sanitized = hex.replace('#', '');
    const bigint = parseInt(sanitized, 16);
    return [((bigint >> 16) & 255) / 255, ((bigint >> 8) & 255) / 255, (bigint & 255) / 255];
  }

  function isColorInput(inp) {
    return (inp.type && inp.type.startsWith && inp.type.startsWith('vec') && /color/i.test(inp.name));
  }

  function sliderRangeFor(inp) {
    const init = inp && inp.value;
    if (inp.type === 'int') return { min: 0, max: init !== undefined ? Math.max(1, Math.abs(init) * 2) : 10, step: 1 };
    if (inp.type === 'float') return { min: init !== undefined ? Math.min(0, init - 1) : 0, max: init !== undefined ? Math.max(1, init + 1) : 1, step: 0.01 };
    return { min: 0, max: 1, step: 0.01 };
  }

  function isArrayLike(inp) {
    const val = getValue(inp.name, inp);
    return (inp.type && inp.type.startsWith && inp.type.startsWith('vec')) || Array.isArray(val) || Array.isArray(inp.value);
  }

  function arrayLength(inp) {
    if (inp.type && inp.type.startsWith && inp.type.startsWith('vec')) return parseInt(inp.type.slice(3));
    const val = getValue(inp.name, inp);
    if (Array.isArray(val)) return val.length;
    if (Array.isArray(inp.value)) return inp.value.length;
    return 1;
  }

  function idFor(name, idx) {
    const base = name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '');
    return idx === undefined ? `param-${base}` : `param-${base}-${idx}`;
  }
</script>

{#if state.task?.inputs?.length}
  <div class="space-y-4 p-2">
    {#each state.task.inputs as inp (inp.name)}
      <Collapsible.Collapsible>
        <Collapsible.CollapsibleTrigger class="flex justify-between items-center px-2 py-1 bg-gray-100 rounded hover:bg-gray-200">
          <span>{inp.name}</span>
          <span class="text-sm text-gray-500">{inp.type}</span>
        </Collapsible.CollapsibleTrigger>
        <Collapsible.CollapsibleContent class="p-2 border-l border-gray-200 ml-2 space-y-2">

          {#if inp.type === 'int' && (getValue(inp.name, inp) === 0 || getValue(inp.name, inp) === 1)}
            <div class="flex items-center gap-2">
              <input id={idFor(inp.name)} type="checkbox" checked={!!getValue(inp.name, inp)} on:change={(e)=>setInputObj(inp, e.currentTarget.checked ? 1 : 0)} />
              <label for={idFor(inp.name)} class="font-medium">{inp.name}</label>
            </div>

          {:else if isColorInput(inp)}
            <div class="flex items-center gap-2">
              <label for={idFor(inp.name)} class="font-medium">{inp.name}</label>
              <input id={idFor(inp.name)} type="color" value={rgbToHex(getValue(inp.name, inp))} on:input={(e)=>setInputObj(inp, hexToRgbFloat(e.target.value))} />
            </div>

          {:else if isArrayLike(inp)}
            <div class="grid grid-cols-1 gap-2">
              {#each Array.from({length: arrayLength(inp)}, (_,i)=>i) as idx}
                <div class="flex items-center gap-2">
                  <label for={idFor(inp.name, idx)} class="text-sm">{inp.name}[{idx}]</label>
                  <input id={idFor(inp.name, idx)} type="range" min="0" max="1" step="0.01"
                    value={getValue(inp.name, inp)[idx] ?? (Array.isArray(inp.value) ? inp.value[idx] : 0)}
                    on:input={(e)=>{
                      const cur = Array.isArray(getValue(inp.name, inp)) ? [...getValue(inp.name, inp)] : Array(arrayLength(inp)).fill(0);
                      cur[idx] = +e.target.value;
                      setInputObj(inp, cur);
                    }} />
                  <span class="w-10 text-right text-sm">{(getValue(inp.name, inp)[idx] ?? (Array.isArray(inp.value)? inp.value[idx]:0)).toFixed(2)}</span>
                </div>
              {/each}
            </div>

          {:else if inp.type === 'float' || inp.type === 'int'}
            {#await Promise.resolve(sliderRangeFor(inp)) then r}
              <div class="flex items-center gap-2">
                <label for={idFor(inp.name)} class="font-medium">{inp.name}</label>
                <input id={idFor(inp.name)} type="range" min={r.min} max={r.max} step={r.step}
                  value={getValue(inp.name, inp) ?? (inp.value ?? 0)}
                  on:input={(e)=>setInputObj(inp, inp.type==='int'? Math.round(+e.target.value): +e.target.value)} />
                <span class="w-12 text-right">{getValue(inp.name, inp) ?? (inp.value ?? 0)}</span>
              </div>
            {/await}

          {:else}
            <div class="flex items-center gap-2">
              <label for={idFor(inp.name)} class="font-medium">{inp.name}</label>
              <input id={idFor(inp.name)} value={getValue(inp.name, inp) ?? (inp.value ?? '')} on:change={(e)=>setInputObj(inp, e.target.value)} />
            </div>

          {/if}

        </Collapsible.CollapsibleContent>
      </Collapsible.Collapsible>
    {/each}
  </div>
{:else}
  <div class="text-gray-500 p-2">No inputs for this task.</div>
{/if}
