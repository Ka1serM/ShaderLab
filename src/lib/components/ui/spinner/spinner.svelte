<script lang="ts">
	import { cn } from "$lib/utils.js";
	import Loader2Icon from "phosphor-svelte/lib/SpinnerGapIcon";
	import type { ComponentProps } from "svelte";

	type Props = ComponentProps<typeof Loader2Icon>;

	let { class: className, ...restProps }: Props = $props();
</script>

<Loader2Icon
	role="status"
	aria-label="Wird geladen"
	class={cn("size-4 animate-spin", className)}
	{...restProps}
/>
