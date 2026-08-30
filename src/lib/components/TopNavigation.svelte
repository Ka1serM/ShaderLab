<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/stores';
  import { toggleMode } from 'mode-watcher';
  import Moon from 'phosphor-svelte/lib/MoonIcon';
  import Sun from 'phosphor-svelte/lib/SunIcon';
  import House from 'phosphor-svelte/lib/HouseIcon';
  import BookOpen from 'phosphor-svelte/lib/BookOpenIcon';
  import Presentation from 'phosphor-svelte/lib/PresentationIcon';
  import tasks from '$lib/data/tasks.json';
  import teaching from '$lib/data/teaching.json';
  import { slugify } from '$lib/utils/slugify';
  import LibraryCard from '$lib/components/LibraryCard.svelte';

  function preview(html: string, maxLength = 100) {
    const text = html.replace(/<[^>]+>/g, '');
    return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
  }

  function isActive(path: string) {
    return $page.url.pathname === path;
  }

  function isSectionActive(section: 'tasks' | 'teach') {
    const base = resolve(`/${section}`);
    return $page.url.pathname === base || $page.url.pathname.startsWith(`${base}/`)
      || (section === 'tasks' && $page.url.pathname.startsWith(resolve('/task/')));
  }

  function isOverview(section: 'tasks' | 'teach') {
    return $page.url.pathname === resolve(`/${section}`);
  }

</script>

<header class="top-navigation">
  <a class="top-navigation-brand" href={resolve('/')} aria-label="ShaderLab Startseite">
    <svg class="shaderlab-gizmo h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M16.466 7.5C15.643 4.237 13.952 2 12 2 9.239 2 7 6.477 7 12s2.239 10 5 10c.342 0 .677-.069 1-.2" />
      <path d="m15.194 13.707 3.814 1.86-1.86 3.814" />
      <path d="M19 15.57c-1.804.885-4.274 1.43-7 1.43-5.523 0-10-2.239-10-5s4.477-5 10-5c4.838 0 8.873 1.718 9.8 4" />
    </svg>
    <span class="shaderlab-brand text-xl font-semibold"><span class="shaderlab-word">Shader</span><span class="shaderlab-accent">Lab</span></span>
  </a>

  <nav class="top-navigation-tabs" aria-label="Hauptnavigation">
    <div class="top-navigation-menu" class:has-dropdown={!isOverview('tasks')}>
      <a
        class:active={isSectionActive('tasks')}
        class="top-navigation-tab"
        href={resolve('/tasks')}
      >Aufgaben</a>
      <div class="top-navigation-dropdown" aria-label="Aufgaben">
        <div class="top-navigation-card-grid">
          {#each tasks as task}
            {@const path = resolve(`/task/${slugify(task.title)}`)}
            <LibraryCard href={path} category={task.category} title={task.title} description={preview(task.task)} kind="task" compact active={isActive(path)} />
          {/each}
        </div>
      </div>
    </div>

    <div class="top-navigation-menu" class:has-dropdown={!isOverview('teach')}>
      <a
        class:active={isSectionActive('teach')}
        class="top-navigation-tab"
        href={resolve('/teach')}
      >Lehr-Demos</a>
      <div class="top-navigation-dropdown" aria-label="Lehr-Demos">
        <div class="top-navigation-card-grid">
          {#each teaching as demo}
            {@const path = resolve(`/teach/${demo.id}`)}
            <LibraryCard href={path} category={demo.category} title={demo.title} description={preview(demo.overview)} kind="teaching" compact active={isActive(path)} />
          {/each}
        </div>
      </div>
    </div>
  </nav>

  <button class="top-navigation-theme" onclick={toggleMode} title="Farbschema wechseln" aria-label="Farbschema wechseln">
    <Sun class="block h-4 w-4 dark:hidden" />
    <Moon class="hidden h-4 w-4 dark:block" />
  </button>
</header>

<footer class="mobile-bottom-navigation" aria-label="Mobile Hauptnavigation">
  <a class:active={isActive(resolve('/'))} href={resolve('/')}>
    <House class="h-5 w-5" weight="fill" />
    <span>Home</span>
  </a>
  <a class:active={isSectionActive('tasks')} href={resolve('/tasks')}>
    <BookOpen class="h-5 w-5" weight="fill" />
    <span>Aufgaben</span>
  </a>
  <a class:active={isSectionActive('teach')} href={resolve('/teach')}>
    <Presentation class="h-5 w-5" weight="fill" />
    <span>Lehr-Demos</span>
  </a>
</footer>

<style>
  .top-navigation {
    box-sizing: border-box;
    position: fixed;
    top: 0;
    right: 0;
    left: 0;
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

  .top-navigation-brand .shaderlab-brand {
    transform: translateY(3px);
  }

  .top-navigation-brand .shaderlab-gizmo {
    color: var(--app-red);
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
    transition: color .15s, background .15s, border-color .15s;
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
  }

  @media (min-width: 36.0625rem) {
    .top-navigation-menu.has-dropdown:hover .top-navigation-dropdown {
      display: block;
    }
  }

  .top-navigation-card-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
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

  .top-navigation-theme:hover,
  .top-navigation-theme:focus-visible {
    background: var(--accent);
    color: var(--foreground);
    outline: none;
  }

  .mobile-bottom-navigation {
    display: none;
  }

  @media (max-width: 36rem) {
    .top-navigation {
      gap: .25rem;
      box-shadow: 0 .4rem 1.2rem rgb(0 0 0 / 10%);
    }
    .top-navigation-brand > svg { display: none; }
    .top-navigation-brand {
      position: absolute;
      left: 50%;
      margin: 0;
      transform: translateX(-50%);
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
    .mobile-bottom-navigation a.active {
      color: var(--app-red);
      background: color-mix(in srgb, var(--app-red) 10%, transparent);
    }
    .mobile-bottom-navigation a:focus-visible {
      outline: 2px solid var(--ring);
      outline-offset: -2px;
    }
  }
</style>
