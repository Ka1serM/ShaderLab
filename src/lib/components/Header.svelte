<script lang="ts">
	import { page } from '$app/state';
	import logo from '$lib/images/ShaderLab.svg';
</script>

<header class="flex justify-between items-center p-4">
	<div class="flex items-center gap-2">
		<a href="/" class="flex items-center gap-2">
			<img src={logo} alt="ShaderLab" class="w-8 h-8 object-contain" />
			<p class="text-3xl font-bold tracking-tight">ShaderLab</p>
		</a>
	</div>

	<nav class="flex items-center bg-white/70 backdrop-blur-md rounded-full shadow-sm">
		<svg viewBox="0 0 2 3" aria-hidden="true" class="w-6 h-8 fill-white/70">
			<path d="M0,0 L1,2 C1.5,3 1.5,3 2,3 L2,0 Z" />
		</svg>

		<ul class="flex items-center space-x-4 px-4">
			<li aria-current={page.url.pathname === '/' ? 'page' : undefined}>
				<a href="/" class="uppercase text-sm font-semibold tracking-widest hover:text-blue-500 transition">
					Home
				</a>
			</li>
			<li aria-current={page.url.pathname === '/about' ? 'page' : undefined}>
				<a href="/about" class="uppercase text-sm font-semibold tracking-widest hover:text-blue-500 transition">
					About
				</a>
			</li>
		</ul>

		<svg viewBox="0 0 2 3" aria-hidden="true" class="w-6 h-8 fill-white/70">
			<path d="M0,0 L0,3 C0.5,3 0.5,3 1,2 L2,0 Z" />
		</svg>
	</nav>

	<div class="w-8 h-8"></div>
</header>
