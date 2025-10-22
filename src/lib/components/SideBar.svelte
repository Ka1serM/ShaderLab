<script lang="ts">
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import { useSidebar } from "$lib/components/ui/sidebar/index.js";
  import * as Collapsible from "$lib/components/ui/collapsible/index.js";
  import { ModeWatcher, setMode } from "mode-watcher";
  import { slugify } from '$lib/utils/slugify';
  import * as Avatar from "$lib/components/ui/avatar/index.js";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
    import BadgeCheckIcon from "@lucide/svelte/icons/badge-check";
  import LogOutIcon from "@lucide/svelte/icons/log-out";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import { Moon, Sun } from "lucide-svelte";

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

  // Check if current route is active
  function isActive(path: string) {
    return $page.url.pathname === path;
  }

  // Toggle sidebar
  function handleToggle() {
    if (sidebar)
      sidebar.toggle();
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
          <span class="font-semibold text-lg">ShaderLab</span>
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
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Sidebar.MenuButton
            size="lg"
            class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            {...props}
          >
            <Avatar.Root class="size-8 rounded-lg">
              <Avatar.Fallback class="rounded-lg">MK</Avatar.Fallback>
            </Avatar.Root>
            <div class="grid flex-1 text-left text-sm leading-tight">
              <span class="truncate font-medium">User</span>
              <span class="truncate text-xs">example@email.com</span>
            </div>
            <ChevronsUpDownIcon class="ml-auto size-4" />
          </Sidebar.MenuButton>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        class="w-(--bits-dropdown-menu-anchor-width) min-w-56 rounded-lg"
        side={sidebar.isMobile ? "bottom" : "right"}
        align="end"
        sideOffset={4}
      >
        <DropdownMenu.Label class="p-0 font-normal">
          <div class="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <Avatar.Root class="size-8 rounded-lg">
              <Avatar.Fallback class="rounded-lg">MK</Avatar.Fallback>
            </Avatar.Root>
            <div class="grid flex-1 text-left text-sm leading-tight">
              <span class="truncate font-medium">User</span>
              <span class="truncate text-xs">example@mail.com</span>
            </div>
          </div>
        </DropdownMenu.Label>
        <DropdownMenu.Separator />
        <DropdownMenu.Group>
          <DropdownMenu.Item>
            <SparklesIcon />
            Upgrade to Pro
          </DropdownMenu.Item>
        </DropdownMenu.Group>
        <DropdownMenu.Separator />
        <DropdownMenu.Group>
          <DropdownMenu.Item>
            <BadgeCheckIcon />
            Account
          </DropdownMenu.Item>
          <DropdownMenu.Item onclick={toggleMode} >
            {#if currentMode === 'dark'}
              <Sun />
              <span>Light Mode</span>
            {:else}
              <Moon />
              <span>Dark Mode</span>
            {/if}
          </DropdownMenu.Item>
        </DropdownMenu.Group>
        <DropdownMenu.Separator />
        <DropdownMenu.Item>
          <LogOutIcon />
          Log out
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </Sidebar.MenuItem>
</Sidebar.Menu>
  </Sidebar.Footer>

  <!-- Sidebar Rail (hover to expand when collapsed) -->
  <Sidebar.Rail />
</Sidebar.Root>