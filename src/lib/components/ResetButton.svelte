<script lang="ts">
  import { toast } from 'svelte-sonner';

  export let description = 'Auf die Ausgangswerte zurücksetzen?';
  export let onReset: () => void = () => {};

  let confirmReset = false;

  function reset() {
    onReset();
    toast.success('Auf Ausgangswerte zurückgesetzt');
    confirmReset = false;
  }
</script>

<button class="h-8 rounded-md border border-input px-3 text-sm hover:bg-accent" onclick={() => confirmReset = true}>Zurücksetzen</button>

{#if confirmReset}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) confirmReset = false; }}>
    <div class="w-full max-w-sm rounded-lg bg-background p-5 text-foreground shadow-lg" role="dialog" aria-modal="true" aria-labelledby="reset-title">
      <h2 id="reset-title" class="text-lg font-semibold">Zurücksetzen bestätigen</h2>
      <p class="mt-2 text-sm text-muted-foreground">{description}</p>
      <div class="mt-5 flex justify-end gap-2"><button class="rounded-md border border-input px-3 py-2 text-sm hover:bg-accent" onclick={() => confirmReset = false}>Abbrechen</button><button class="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90" onclick={reset}>Zurücksetzen</button></div>
    </div>
  </div>
{/if}
