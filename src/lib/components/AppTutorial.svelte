<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import BookOpen from 'phosphor-svelte/lib/BookOpenIcon';
  import Code2 from 'phosphor-svelte/lib/CodeIcon';
  import MousePointer2 from 'phosphor-svelte/lib/CursorIcon';
  import PanelTopOpen from 'phosphor-svelte/lib/PresentationIcon';
  import Sparkles from 'phosphor-svelte/lib/SparkleIcon';
  import X from 'phosphor-svelte/lib/XIcon';

  export let mode: 'task' | 'teaching' = 'task';

  const STORAGE_KEY = 'shaderlab:tutorial-completed:v1';
  type Step = { title: string; text: string; selector?: string; icon: typeof Sparkles };

  $: steps = mode === 'task' ? [
    { title: 'Welcome to ShaderLab', text: 'Here you solve a shader task: read the requirements, edit GLSL code, and compare your output with the reference. This tour highlights the relevant areas.', icon: Sparkles },
    { title: 'Task and theory', text: 'The “Task” tab contains the requirements, while “Theory” provides the background. Open the hints if you get stuck.', selector: '[data-tutorial="instructions"]', icon: BookOpen },
    { title: 'Der Shader-Editor', text: 'Im Editor bearbeitest du den GLSL-Code. Wenn beide Shader vorhanden sind, wechselst du oben zwischen Vertex- und Fragment-Shader. Fehlermeldungen erscheinen unter dem Editor und an der betroffenen Zeile.', selector: '[data-tutorial="editor"]', icon: Code2 },
    { title: 'Compare results', text: '“Reference” renders the supplied solution shader. “Output” renders your shader in the same scene, updating as you edit.', selector: '[data-tutorial="viewports"]', icon: PanelTopOpen },
    { title: 'Explore the view', text: 'Drag with the left mouse button to orbit, use the wheel to zoom, and drag with the right button to pan. “Maximise” expands the current panel.', selector: '[data-tutorial="output"]', icon: MousePointer2 }
  ] : [
    { title: 'Welcome to ShaderLab', text: 'This demo explains a specific shader effect. Change its GLSL code and exposed parameters, then inspect the result in the scene.', icon: Sparkles },
    { title: 'Theory and controls', text: 'This area contains the demo’s explanation and parameters. Changing a slider or input updates the corresponding shader uniform.', selector: '[data-tutorial="instructions"]', icon: BookOpen },
    { title: 'Shader editor', text: 'Edit the demo shader here. The preview renders again after each change; “Reset” restores the starter code.', selector: '[data-tutorial="editor"]', icon: Code2 },
    { title: 'Live result', text: 'The preview renders the scene with your current shader and parameters. Demos with transform controls also let you translate, rotate, and scale objects.', selector: '[data-tutorial="output"]', icon: PanelTopOpen },
    { title: 'Move the camera', text: 'Drag with the left mouse button to orbit, use the wheel to zoom, and drag with the right button to pan. “Maximise” expands the current panel.', selector: '[data-tutorial="output"]', icon: MousePointer2 }
  ];

  let visible = false;
  let current = 0;
  let targetRect: DOMRect | null = null;
  $: isCameraStep = steps[current]?.selector === '[data-tutorial="output"]' && steps[current]?.icon === MousePointer2;

  function updateTarget() {
    const selector = steps[current]?.selector;
    const element = selector ? document.querySelector<HTMLElement>(selector) : null;
    targetRect = element?.getBoundingClientRect() ?? null;
  }

  async function showStep(index: number) {
    current = index;
    await tick();
    const selector = steps[current]?.selector;
    const element = selector ? document.querySelector<HTMLElement>(selector) : null;
    element?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    window.setTimeout(updateTarget, 220);
    updateTarget();
  }

  function finish() {
    localStorage.setItem(STORAGE_KEY, 'true');
    visible = false;
  }

  function next() { current === steps.length - 1 ? finish() : void showStep(current + 1); }
  function previous() { if (current > 0) void showStep(current - 1); }

  function handleKeydown(event: KeyboardEvent) {
    if (!visible) return;
    if (event.key === 'Escape') finish();
    if (event.key === 'ArrowRight' || event.key === 'Enter') next();
    if (event.key === 'ArrowLeft') previous();
  }

  onMount(async () => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    await tick();
    visible = true;
    updateTarget();
    window.addEventListener('resize', updateTarget);
    window.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    window.removeEventListener('resize', updateTarget);
    window.removeEventListener('keydown', handleKeydown);
  });
</script>

{#if visible}
  <div class="pointer-events-none fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
    {#if targetRect}
      <div class="tutorial-spotlight pointer-events-none fixed ring-2 ring-[#bf2732] transition-all duration-200" style={`left:${Math.max(8, targetRect.left - 4)}px;top:${Math.max(8, targetRect.top - 4)}px;width:${Math.min(innerWidth - 16, targetRect.width + 8)}px;height:${Math.min(innerHeight - 16, targetRect.height + 8)}px`}></div>
    {:else}
      <div class="tutorial-dim absolute inset-0"></div>
    {/if}

    {#if isCameraStep && targetRect}
      <div
        class="tutorial-gesture-frame pointer-events-none fixed z-10 flex items-center justify-center overflow-hidden"
        style={`left:${targetRect.left}px;top:${targetRect.top}px;width:${targetRect.width}px;height:${targetRect.height}px`}
        aria-hidden="true"
      >
        <svg class="camera-gesture h-36 w-52 drop-shadow-lg" viewBox="0 0 208 144" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path class="gesture-path" d="M35 77C67 38 137 36 174 75" stroke="white" stroke-width="3" stroke-linecap="round" stroke-dasharray="7 8"/>
          <path d="M164 62L176 75L161 83" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          <g class="gesture-mouse">
            <rect x="23" y="54" width="30" height="45" rx="15" fill="rgba(10,10,10,.82)" stroke="white" stroke-width="2.5"/>
            <path d="M38 55V73" stroke="white" stroke-width="2"/>
            <path class="gesture-click" d="M25 70C25 62.268 31.268 56 39 56V73H25V70Z" fill="white" fill-opacity=".9"/>
          </g>
          <text x="104" y="126" fill="white" font-size="13" font-family="Inter, sans-serif" font-weight="600" text-anchor="middle">Click and drag to orbit</text>
        </svg>
      </div>
    {/if}

    <div class="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
      <section class="tutorial-card pointer-events-auto w-full max-w-md border bg-background text-foreground shadow-lg">
        <div class="flex items-start gap-4">
          <div class="tutorial-icon flex h-10 w-10 shrink-0 items-center justify-center bg-primary text-primary-foreground"><svelte:component this={steps[current].icon} class="h-5 w-5" /></div>
          <div class="min-w-0 flex-1">
            <div class="mb-1 flex items-center justify-between gap-3"><span class="text-xs font-medium uppercase tracking-wider text-muted-foreground">Step {current + 1} of {steps.length}</span><button class="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close tutorial" onclick={finish}><X class="h-4 w-4" /></button></div>
            <h2 id="tutorial-title" class="text-xl font-semibold">{steps[current].title}</h2>
            <p class="mt-2 text-sm leading-6 text-muted-foreground">{steps[current].text}</p>
          </div>
        </div>
        <div class="mt-6 flex items-center justify-between gap-4">
          <div class="flex gap-1.5" aria-hidden="true">{#each steps as _, index}<span class="h-1.5 rounded-full transition-all" class:w-5={index === current} class:w-1.5={index !== current} class:bg-foreground={index === current} class:bg-muted={index !== current}></span>{/each}</div>
          <div class="flex gap-2">{#if current > 0}<button class="rounded-md border border-input px-3 py-2 text-sm hover:bg-accent" onclick={previous}>Back</button>{/if}<button class="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90" onclick={next}>{current === steps.length - 1 ? 'Got it' : 'Next'}</button></div>
        </div>
      </section>
    </div>
  </div>
{/if}

<style>
  /* Intentionally independent of the app theme: black transparency visibly
     dims both the light canvas and the already-dark canvas. */
  .tutorial-spotlight { box-shadow: 0 0 0 9999px rgb(0 0 0 / 72%); }
  .tutorial-dim { background: rgb(0 0 0 / 72%); }
  .tutorial-spotlight, .tutorial-gesture-frame, .tutorial-card { border-radius: .5rem; }
  .tutorial-card { padding: clamp(1.25rem, 3vw, 1.5rem); }
  .tutorial-icon { border-radius: .4rem; }

  .gesture-mouse { animation: drag-mouse 2.4s ease-in-out infinite; }
  .gesture-click { animation: click-mouse 2.4s ease-in-out infinite; }
  .gesture-path { animation: pulse-path 2.4s ease-in-out infinite; }

  @keyframes drag-mouse {
    0%, 12% { transform: translateX(0); }
    70%, 82% { transform: translateX(122px); }
    100% { transform: translateX(0); }
  }
  @keyframes click-mouse {
    0%, 8%, 88%, 100% { opacity: .2; }
    14%, 80% { opacity: 1; }
  }
  @keyframes pulse-path {
    0%, 100% { opacity: .35; }
    20%, 78% { opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .gesture-mouse, .gesture-click, .gesture-path { animation: none; }
    .gesture-mouse { transform: translateX(60px); }
  }
</style>
