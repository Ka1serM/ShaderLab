<script>
  import { useSidebar } from "$lib/components/ui/sidebar/index.js";
  import { PanelLeft } from "lucide-svelte";
  import { asset, base } from "$app/paths";
  import { IsMobile } from '$lib/hooks/is-mobile.js';
  import { goto } from "$app/navigation";

  const sidebar = useSidebar();      
  const mobileQuery = new IsMobile(); 

  function toggleSidebar() {
    if (!sidebar) return;

    if (sidebar.isMobile) {
      sidebar.setOpenMobile(!sidebar.openMobile);
    } else {
      sidebar.toggle();
    }
  }

  function navigateHome() {
    goto(base + '/');
  }
</script>

{#if mobileQuery.current}
  <div class="fixed top-0 left-0 right-0 z-50 flex items-center justify-center bg-background shadow-md h-14 px-4">
    
    <!-- Sidebar toggle button -->
    <button 
      onclick={toggleSidebar}
      class="absolute left-4 p-2 rounded-md hover:bg-muted/50 transition"
      aria-label="Toggle sidebar"
    >
      <PanelLeft class="w-5 h-5 text-foreground" />
    </button>

    <!-- Logo + title clickable -->
    <a class="flex items-center gap-2 cursor-pointer" onclick={navigateHome}>
      <img src={asset('/favicon.svg')} alt="ShaderLab Logo" class="w-6 h-6 dark:invert" />
      <span class="font-semibold text-xl text-foreground">ShaderLab</span>
    </a>
  </div>
{/if}
