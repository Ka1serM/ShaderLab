<script lang="ts" generics="T extends string">
  import * as ToggleGroup from '$lib/components/ui/toggle-group';
  import { cn } from '$lib/utils.js';

  export let value: T;
  export let options: readonly { value: T; label: string }[];
  export let onChange: (value: T) => void;
  export let size: 'default' | 'small' = 'default';
  export let disabled = false;
  export let ariaLabel: string | undefined = undefined;
  let className = '';
  export { className as class };

  // A single toggle group reports "" when the active item is clicked again. A switcher always
  // keeps one option selected, so that click is ignored and the getter keeps the item active.
  function select(next: string) {
    if (next && next !== value) onChange(next as T);
  }
</script>

<ToggleGroup.Root
  type="single"
  aria-label={ariaLabel}
  {disabled}
  bind:value={() => value, select}
  class={cn('gap-0 bg-muted p-0', className)}
>
  {#each options as option (option.value)}
    <ToggleGroup.Item
      value={option.value}
      class={cn(
        'border-none transition-colors hover:bg-muted/50 data-[state=on]:rounded-md data-[state=on]:bg-background data-[state=on]:shadow-sm dark:data-[state=on]:bg-input/30',
        size === 'small' ? 'h-8 px-3' : 'h-10 px-4'
      )}
    >{option.label}</ToggleGroup.Item>
  {/each}
</ToggleGroup.Root>
