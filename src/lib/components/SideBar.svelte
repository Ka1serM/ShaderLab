<script lang="ts">
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import { useSidebar } from "$lib/components/ui/sidebar/index.js";
  import * as Collapsible from "$lib/components/ui/collapsible/index.js";
  import { ModeWatcher, setMode } from "mode-watcher";
  import { slugify } from '$lib/utils/slugify';
  
  import { 
    House, 
    BookOpen, 
    UserRound, 
    ChevronUp, 
    ChevronDown,
    PanelLeftClose,
    PanelLeft
  } from "lucide-svelte";

  import tasks from "$lib/data/tasks.json";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { browser } from "$app/environment";
  import { asset, resolve } from "$app/paths";

  // Get sidebar context
  const sidebar = useSidebar();
  
  // Safe access to sidebar state
  let isOpen = $derived(browser && sidebar ? sidebar.open : true);

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

  // Check if current route is active
  function isActive(path: string) {
    return $page.url.pathname === path;
  }

  // Toggle sidebar
  function handleToggle() {
    if (browser && sidebar) {
      sidebar.toggle();
    }
  }

  // Theme state
  let currentMode: "light" | "dark" = "light";
  function toggleMode() { 
    const newMode = currentMode === "dark" ? "light" : "dark"; 
    currentMode = newMode;
    setMode(newMode); 
  }
</script>

<ModeWatcher />
<Sidebar.Root collapsible="icon" class="transition-none">
  <!-- Header -->
  <Sidebar.Header class="px-3 py-2">
    <div class="flex items-center justify-between w-full">
      {#if isOpen}
        <div class="flex items-center gap-2">
          <img 
            src={asset('/favicon.svg')} 
            alt="ShaderLab Logo" 
            class="w-5 h-5 dark:invert" 
          />
          <button onclick={toggleMode} class="font-semibold text-lg">ShaderLab</button>
        </div>
      {/if}
      
      <button
        onclick={handleToggle}
        class="rounded hover:bg-sidebar-accent transition-colors p-1 ml-auto"
        title={isOpen ? "Collapse sidebar" : "Expand sidebar"}
        aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
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
                <span>Home</span>
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
                <span>Tasks</span>
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
  </Sidebar.Content>

  <!-- Footer -->
  <Sidebar.Footer>
    <Sidebar.Menu>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton>
          {#snippet child({ props })}
            <div {...props}>
              <UserRound class="w-4 h-4" />
              {#if isOpen}
                <span>Marcel</span>
              {/if}
              <ChevronUp class="ml-auto w-4 h-4" />
            </div>
          {/snippet}
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
    </Sidebar.Menu>
  </Sidebar.Footer>

  <!-- Sidebar Rail (hover to expand when collapsed) -->
  <Sidebar.Rail />
</Sidebar.Root>