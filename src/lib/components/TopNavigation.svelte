<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/stores';
  import { toggleMode } from 'mode-watcher';
  import Moon from 'phosphor-svelte/lib/MoonIcon';
  import Sun from 'phosphor-svelte/lib/SunIcon';
  import House from 'phosphor-svelte/lib/HouseIcon';
  import BookOpen from 'phosphor-svelte/lib/BookOpenIcon';
  import Presentation from 'phosphor-svelte/lib/PresentationIcon';
  import { tasks, teaching } from '$lib/content';
  import { slugify } from '$lib/utils/slugify';
  import LibraryCard from '$lib/components/LibraryCard.svelte';
  import ShaderLabLogo from '$lib/components/ShaderLabLogo.svelte';

  let logoReplay = 0;

  function replayLogo() { logoReplay += 1; }

  function preview(html: string, maxLength = 100) {
    const text = html.replace(/<[^>]+>/g, '');
    return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
  }

  function isActive(path: string) {
    return $page.url.pathname === path;
  }

  function isSectionActive(section: 'tasks' | 'teach') {
    const base = resolve(`/${section}/`);
    return $page.url.pathname === base || $page.url.pathname.startsWith(base)
      || (section === 'tasks' && $page.url.pathname.startsWith(`${resolve('/task')}/`));
  }

  function isOverview(section: 'tasks' | 'teach') {
    return $page.url.pathname === resolve(`/${section}/`);
  }

</script>

<header class="top-navigation">
  <a class="top-navigation-brand motion-press" href={resolve('/')} aria-label="ShaderLab home" onclick={replayLogo}>
    <ShaderLabLogo animation={logoReplay ? 'replay' : 'reveal'} replay={logoReplay} className="h-5 w-5" />
    <span class="shaderlab-brand text-2xl font-semibold"><span class="shaderlab-word">Shader</span><span class="shaderlab-accent">Lab</span></span>
  </a>

  <nav class="top-navigation-tabs" aria-label="Main navigation">
    <div class="top-navigation-menu" class:has-dropdown={!isOverview('tasks')}>
      <a
        class:active={isSectionActive('tasks')}
        class="top-navigation-tab motion-press"
        href={resolve('/tasks/')}
      >Tasks</a>
      <div class="top-navigation-dropdown" aria-label="Tasks">
        <div class="top-navigation-card-grid">
          {#each tasks as task}
            {@const path = resolve(`/task/${slugify(task.title)}/`)}
            <LibraryCard href={path} category={task.category} title={task.title} description={preview(task.task)} kind="task" compact active={isActive(path)} />
          {/each}
        </div>
      </div>
    </div>

    <div class="top-navigation-menu" class:has-dropdown={!isOverview('teach')}>
      <a
        class:active={isSectionActive('teach')}
        class="top-navigation-tab motion-press"
        href={resolve('/teach/')}
      >Teaching demos</a>
      <div class="top-navigation-dropdown" aria-label="Teaching demos">
        <div class="top-navigation-card-grid">
          {#each teaching as demo}
            {@const path = resolve(`/teach/${demo.id}/`)}
            <LibraryCard href={path} category={demo.category} title={demo.title} description={preview(demo.overview)} kind="teaching" compact active={isActive(path)} />
          {/each}
        </div>
      </div>
    </div>
  </nav>

  <button class="top-navigation-theme motion-press" onclick={toggleMode} title="Toggle colour theme" aria-label="Toggle colour theme">
    <Sun class="block h-4 w-4 dark:hidden" />
    <Moon class="hidden h-4 w-4 dark:block" />
  </button>
</header>

<footer class="mobile-bottom-navigation" aria-label="Mobile main navigation">
  <a class:active={isActive(resolve('/'))} class="motion-press" href={resolve('/')}>
    <House class="h-5 w-5" weight="fill" />
    <span>Home</span>
  </a>
  <a class:active={isSectionActive('tasks')} class="motion-press" href={resolve('/tasks/')}>
    <BookOpen class="h-5 w-5" weight="fill" />
    <span>Tasks</span>
  </a>
  <a class:active={isSectionActive('teach')} class="motion-press" href={resolve('/teach/')}>
    <Presentation class="h-5 w-5" weight="fill" />
    <span>Teaching demos</span>
  </a>
</footer>

<style>
  .top-navigation {
    box-sizing: border-box;
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    z-index: 50;
    display: flex;
    min-height: calc(3.5rem + env(safe-area-inset-top));
    align-items: center;
    gap: 1.25rem;
    border-bottom: 1px solid var(--app-line);
    background: var(--background);
    padding: env(safe-area-inset-top) .75rem 0;
  }

  .top-navigation-brand {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: .5rem;
    color: var(--foreground);
  }

  .top-navigation-brand .shaderlab-brand { transform: translateY(1px); }

  .top-navigation-brand :global(.shaderlab-gizmo) {
    transition: transform var(--motion-slow) var(--motion-emphasized);
  }

  .top-navigation-brand:hover :global(.shaderlab-gizmo) {
    transform: rotate(-18deg) scale(1.08);
  }

  .top-navigation-tabs {
    display: flex;
    min-width: 0;
    align-self: stretch;
    align-items: stretch;
    gap: .15rem;
    overflow: visible;
  }

  .top-navigation-tab {
    display: inline-flex;
    align-self: center;
    height: 2.25rem;
    align-items: center;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    padding: 0 .75rem;
    color: var(--muted-foreground);
    font-size: .875rem;
    font-weight: 500;
    white-space: nowrap;
    transition: color var(--motion-fast) ease, background-color var(--motion-fast) ease, border-color var(--motion-fast) ease, transform var(--motion-fast) var(--motion-ease);
  }

  .top-navigation-tab:hover,
  .top-navigation-tab:focus-visible,
  .top-navigation-tab.active {
    border-color: color-mix(in srgb, var(--app-red) 55%, transparent);
    color: var(--foreground);
    background: color-mix(in srgb, var(--app-red) 10%, transparent);
    outline: none;
  }

  .top-navigation-menu {
    position: relative;
    display: flex;
  }

  .top-navigation-dropdown {
    position: absolute;
    top: calc(100% - 1px);
    left: 0;
    display: none;
    width: min(42rem, calc(100vw - 1.5rem));
    max-height: min(30rem, calc(100vh - 4.5rem));
    overflow-y: auto;
    border: 1px solid var(--app-line);
    border-radius: 0 0 .5rem .5rem;
    background: var(--background);
    box-shadow: 0 .8rem 1.8rem rgb(0 0 0 / 16%);
    z-index: 2;
    will-change: opacity;
  }

  @media (min-width: 36.0625rem) {
    .top-navigation-menu.has-dropdown:hover .top-navigation-dropdown {
      display: block;
      animation: motion-fade var(--motion-slow) var(--motion-ease) both;
    }
  }

  .top-navigation-card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 13rem), 1fr));
    gap: .6rem;
    padding: .6rem;
  }

  .top-navigation-theme {
    display: inline-flex;
    flex: none;
    height: 2rem;
    width: 2rem;
    align-items: center;
    justify-content: center;
    margin-left: auto;
    border-radius: .375rem;
    color: var(--muted-foreground);
  }

  .top-navigation-theme :global(svg) {
    transition: transform var(--motion-base) var(--motion-emphasized);
  }

  .top-navigation-theme:hover,
  .top-navigation-theme:focus-visible {
    background: var(--accent);
    color: var(--foreground);
    outline: none;
  }

  .top-navigation-theme:hover :global(svg),
  .top-navigation-theme:focus-visible :global(svg) {
    transform: rotate(35deg);
  }

  @media (max-width: 48rem) {
    .top-navigation-brand .shaderlab-brand {
      font-size: 1.35rem;
    }
  }

  .mobile-bottom-navigation {
    display: none;
  }

  @media (max-width: 36rem) {
    .top-navigation {
      gap: .25rem;
      box-shadow: 0 .4rem 1.2rem rgb(0 0 0 / 10%);
    }
    .top-navigation-brand > :global(.shaderlab-gizmo) { display: block; width: 1.25rem; height: 1.25rem; }
    .top-navigation-brand {
      position: absolute;
      left: 50%;
      margin: 0;
      /* Individual property, not `transform`: it composes with the `scale` that
         .motion-press applies on tap instead of being scaled by it. */
      translate: -50%;
    }
    .top-navigation-theme { position: relative; z-index: 1; }
    .top-navigation-tabs { display: none; }
    .mobile-bottom-navigation {
      position: fixed;
      z-index: 50;
      right: 0;
      bottom: 0;
      left: 0;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      border-top: 1px solid var(--app-line);
      background: color-mix(in srgb, var(--background) 94%, transparent);
      box-shadow: 0 -.4rem 1.2rem rgb(0 0 0 / 10%);
      backdrop-filter: blur(12px);
      padding: .4rem .5rem env(safe-area-inset-bottom);
    }
    .mobile-bottom-navigation a {
      display: flex;
      min-height: 3.25rem;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: .2rem;
      border-radius: .5rem;
      color: var(--muted-foreground);
      font-size: .6875rem;
      font-weight: 600;
      line-height: 1;
    }
    .mobile-bottom-navigation a :global(svg) {
      transition: transform var(--motion-base) var(--motion-emphasized);
    }
    .mobile-bottom-navigation a.active {
      color: var(--app-red);
      background: color-mix(in srgb, var(--app-red) 10%, transparent);
    }
    .mobile-bottom-navigation a.active :global(svg) {
      transform: translateY(-1px) scale(1.12);
    }
    .mobile-bottom-navigation a:focus-visible {
      outline: 2px solid var(--ring);
      outline-offset: -2px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .top-navigation-dropdown {
      animation: none;
    }

    .top-navigation-brand :global(.shaderlab-gizmo),
    .top-navigation-theme :global(svg),
    .mobile-bottom-navigation a :global(svg) {
      transition: none;
      transform: none;
    }
  }
</style>
