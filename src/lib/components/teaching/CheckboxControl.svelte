<script lang="ts">
  export let value = false;
  export let label = '';
  export let onChange: (value: boolean) => void = () => {};
</script>

<label class="teaching-checkbox-control">
  <input aria-label={label} type="checkbox" checked={value} oninput={(event) => onChange((event.currentTarget as HTMLInputElement).checked)} />
  <span class="teaching-checkbox-label">{label}</span>
  <span class="teaching-checkbox-status">{value ? 'Aktiv' : 'Inaktiv'}</span>
</label>
