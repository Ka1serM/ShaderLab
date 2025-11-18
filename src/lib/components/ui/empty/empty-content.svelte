<script>
	import { cn } from "$lib/utils.js";
	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="empty-content"
	class={cn(
		"flex w-full min-w-0 max-w-sm flex-col items-center gap-4 text-balance text-sm",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>