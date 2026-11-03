<script lang="ts">
  import { useApplication } from '$lib/app/application.svelte';
  import TeachingView from '$lib/views/TeachingView.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const app = useApplication();

  // The route only tells the app what to show. The first call also runs
  // during prerendering, so the page HTML already contains the demo.
  const open = () => app.openTeaching(data.title, data.definition);
  open();
  $effect.pre(open);
</script>

<svelte:head><title>{data.definition.title} · ShaderLab</title></svelte:head>

<TeachingView />
