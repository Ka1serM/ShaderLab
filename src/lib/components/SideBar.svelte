<script lang="ts">
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import { useSidebar } from "$lib/components/ui/sidebar/index.js";
  import * as Collapsible from "$lib/components/ui/collapsible/index.js";
  import { slugify } from '$lib/utils/slugify';
  import Moon from "phosphor-svelte/lib/MoonIcon";
  import Sun from "phosphor-svelte/lib/SunIcon";
  import { toggleMode } from "mode-watcher";

  import House from "phosphor-svelte/lib/HouseIcon";
  import BookOpen from "phosphor-svelte/lib/BookOpenIcon";
  import Presentation from "phosphor-svelte/lib/PresentationIcon";
  import ChevronDown from "phosphor-svelte/lib/CaretDownIcon";
  import PanelLeftClose from "phosphor-svelte/lib/SidebarSimpleIcon";
  import PanelLeft from "phosphor-svelte/lib/SidebarIcon";

  import tasks from "$lib/data/tasks.json";
  import teaching from "$lib/data/teaching.json";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { asset, resolve } from "$app/paths";

  // Get sidebar context
  const sidebar = useSidebar();
  
  // Safe access to sidebar state
  let isOpen = $derived(sidebar ? sidebar.open : true);

  // Group tasks by category
  const tasksByCategory = $derived(
    Object.entries(
      tasks.reduce((acc, task) => {
        const category = task.category ?? "Uncategorized";
        (acc[category] ||= []).push(task);
        return acc;
      }, {} as Record<string, typeof tasks>)
    )
  );

  // Navigation helpers
  function navigateToHome(e: MouseEvent) {
    e.preventDefault();
    goto(resolve('/'));
  }

  function navigateToTask(title: string) {
    return (e: MouseEvent) => {
      e.preventDefault();
      goto(resolve(`/task/${slugify(title)}`));
    };
  }

  function navigateToTeaching(id: string) {
    return (e: MouseEvent) => {
      e.preventDefault();
      goto(resolve(`/teach/${id}`));
    };
  }

  // Check if current route is active
  function isActive(path: string) {
    return $page.url.pathname === path;
  }

  // Toggle sidebar
  function handleToggle() {
    if (sidebar)
      sidebar.toggle();
  }
</script>

<Sidebar.Root collapsible="icon" class="transition-none">
  <!-- Header -->
  <Sidebar.Header class="px-3 py-2">
    <div class="flex items-center justify-between w-full">
      {#if isOpen}
        <div class="flex items-center gap-2">
          <img 
            src={asset('/favicon.svg')} 
            alt="ShaderLab Logo" 
            class="shaderlab-gizmo w-5 h-5" 
          />
          <span class="shaderlab-brand font-semibold text-lg"><span class="shaderlab-word">Shader</span><span class="shaderlab-accent">Lab</span></span>
        </div>
      {/if}
      
      <button
        onclick={handleToggle}
        class="rounded hover:bg-sidebar-accent transition-colors p-1 ml-auto"
        title={isOpen ? "Seitenleiste einklappen" : "Seitenleiste ausklappen"}
        aria-label={isOpen ? "Seitenleiste einklappen" : "Seitenleiste ausklappen"}
      >
        {#if isOpen}
          <PanelLeftClose class="w-4 h-4" />
        {:else}
          <PanelLeft class="w-4 h-4" />
        {/if}
      </button>
    </div>
  </Sidebar.Header>

  <!-- Content -->
  <Sidebar.Content class="flex-1">

    <!-- Home -->
    <Sidebar.Group>
      <Sidebar.Menu>
        <!-- Home MenuItem -->
        <Sidebar.MenuItem>
          <Sidebar.MenuButton 
            onclick={navigateToHome}
            isActive={isActive(resolve('/'))}
          >
            {#snippet child({ props })}
              <a href={resolve('/')} {...props}>
                <House class="w-4 h-4" />
                <span>Startseite</span>
              </a>
            {/snippet}
          </Sidebar.MenuButton>
        </Sidebar.MenuItem>

        <!-- Tasks MenuItem -->
        <Sidebar.MenuItem>
          <Sidebar.MenuButton
            onclick={(e) => { e.preventDefault(); goto(resolve('/tasks')); }}
            isActive={isActive(resolve('/tasks'))}
          >
            {#snippet child({ props })}
              <a href={resolve('/tasks')} {...props}>
                <BookOpen class="w-4 h-4" />
                <span>Aufgaben</span>
              </a>
            {/snippet}
          </Sidebar.MenuButton>
        </Sidebar.MenuItem>

        <Sidebar.MenuItem>
          <Sidebar.MenuButton
            onclick={(e) => { e.preventDefault(); goto(resolve('/teach')); }}
            isActive={$page.url.pathname === resolve('/teach')}
          >
            {#snippet child({ props })}
              <a href={resolve('/teach')} {...props}>
                <Presentation class="w-4 h-4" />
                <span>Lehr-Demos</span>
              </a>
            {/snippet}
          </Sidebar.MenuButton>
        </Sidebar.MenuItem>
      </Sidebar.Menu>
    </Sidebar.Group>

    <!-- Tasks by Category -->
    {#each tasksByCategory as [category, categoryTasks]}
      <Collapsible.Root open class="group/collapsible">
        <Sidebar.Group>
          <Sidebar.GroupLabel>
            {#snippet child({ props })}
              <Collapsible.Trigger {...props}>
                <div class="flex items-center gap-2">
                  <BookOpen class="w-4 h-4" />
                  <span>{category}</span>
                </div>
                <ChevronDown
                  class="ml-auto w-4 h-4 transition-transform group-data-[state=open]/collapsible:rotate-180"
                />
              </Collapsible.Trigger>
            {/snippet}
          </Sidebar.GroupLabel>

          <Collapsible.Content>
            <Sidebar.GroupContent>
              <Sidebar.Menu>
                {#each categoryTasks as task}
                  {@const taskSlug = slugify(task.title)}
                  {@const taskPath = resolve(`/task/${taskSlug}`)}
                  <Sidebar.MenuItem>
                    <Sidebar.MenuButton
                      onclick={navigateToTask(task.title)}
                      isActive={isActive(taskPath)}
                    >
                      {#snippet child({ props })}
                        <a href={taskPath} {...props}>
                          <BookOpen class="w-4 h-4" />
                          <span>{task.title}</span>
                        </a>
                      {/snippet}
                    </Sidebar.MenuButton>
                  </Sidebar.MenuItem>
                {/each}
              </Sidebar.Menu>
            </Sidebar.GroupContent>
          </Collapsible.Content>
        </Sidebar.Group>
      </Collapsible.Root>
    {/each}

    <Collapsible.Root open class="group/collapsible">
      <Sidebar.Group>
        <Sidebar.GroupLabel>
          {#snippet child({ props })}
            <Collapsible.Trigger {...props}>
              <div class="flex items-center gap-2"><Presentation class="w-4 h-4" /><span>Lehr-Demos</span></div>
              <ChevronDown class="ml-auto w-4 h-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
            </Collapsible.Trigger>
          {/snippet}
        </Sidebar.GroupLabel>
        <Collapsible.Content>
          <Sidebar.GroupContent>
            <Sidebar.Menu>
              {#each teaching as demo}
                {@const demoPath = resolve(`/teach/${demo.id}`)}
                <Sidebar.MenuItem>
                  <Sidebar.MenuButton onclick={navigateToTeaching(demo.id)} isActive={isActive(demoPath)}>
                    {#snippet child({ props })}
                      <a href={demoPath} {...props}><Presentation class="w-4 h-4" /><span>{demo.title}</span></a>
                    {/snippet}
                  </Sidebar.MenuButton>
                </Sidebar.MenuItem>
              {/each}
            </Sidebar.Menu>
          </Sidebar.GroupContent>
        </Collapsible.Content>
      </Sidebar.Group>
    </Collapsible.Root>
  </Sidebar.Content>

  <!-- Footer -->
  <Sidebar.Footer>
    <Sidebar.Menu>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton onclick={toggleMode} class="w-full justify-start gap-2">
          <Sun class="block dark:hidden h-4 w-4" />
          <Moon class="hidden dark:block h-4 w-4" />
          <span class="block dark:hidden">Dunkler Modus</span>
          <span class="hidden dark:block">Heller Modus</span>
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
    </Sidebar.Menu>
  </Sidebar.Footer>

  <!-- Sidebar Rail (hover to expand when collapsed) -->
  <Sidebar.Rail />
</Sidebar.Root>
