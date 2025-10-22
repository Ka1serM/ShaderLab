<script lang="ts">
	import welcome from '$lib/images/svelte-welcome.webp';
	import welcomeFallback from '$lib/images/svelte-welcome.png';
</script>

<svelte:head>
	<title>ShaderLab</title>
	<meta name="description" content="ShaderLab - Learn Shaders Online" />
</svelte:head>

<section class="flex flex-col justify-center items-center flex-[0.6]">
	<h1 class="w-full">
		<span class="relative block w-full pb-[24.165%]">
			<picture class="absolute inset-0 w-full h-full">
				<source srcset={welcome} type="image/webp" />
				<img src={welcomeFallback} alt="Welcome" class="absolute inset-0 w-full h-full object-cover" />
			</picture>
		</span>
	</h1>
</section>
