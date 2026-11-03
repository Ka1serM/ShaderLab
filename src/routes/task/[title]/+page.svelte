<script lang="ts">
  import { useApplication } from '$lib/app/application.svelte';
  import TaskView from '$lib/views/TaskView.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const app = useApplication();

  // The route only tells the app what to show. The first call also runs
  // during prerendering, so the page HTML already contains the task.
  const open = () => app.openTask(data.slug, data.task);
  open();
  $effect.pre(open);
</script>

<TaskView />
