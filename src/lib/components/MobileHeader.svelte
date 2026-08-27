<script lang="ts">
  import { useSidebar } from "$lib/components/ui/sidebar/index.js";
  import { PanelLeft } from "lucide-svelte";
  import { asset, base } from "$app/paths";
  import { IsMobile } from '$lib/hooks/is-mobile.svelte';
  import { goto } from "$app/navigation";

  const sidebar = useSidebar();      
  const mobileQuery = new IsMobile(); 

  function toggleSidebar() {
    if (!sidebar) return;

    // Toggle mobile sidebar if on mobile
    if (sidebar.isMobile) {
      sidebar.setOpenMobile(!sidebar.openMobile);
    } else {
      sidebar.toggle(); // fallback desktop
    }
  }

  function navigateHome() {
    // Prepend base path
    goto(base + '/');
  }
</script>

{#if mobileQuery.current}
  <div class="shaderlab-mobile-header fixed top-0 left-0 right-0 z-50 flex items-center justify-center bg-background shadow-md h-14 px-4">
    
    <!-- Sidebar toggle button -->
    <button 
      onclick={toggleSidebar}
      class="absolute left-4 p-2 rounded-md hover:bg-muted/50 transition"
      aria-label="Toggle sidebar"
    >
      <PanelLeft class="w-5 h-5 text-foreground" />
    </button>

    <!-- Logo + title clickable -->
    <a href={base + '/'} class="flex items-center gap-2 cursor-pointer" onclick={(event) => { event.preventDefault(); navigateHome(); }}>
      <img src={asset('/favicon.svg')} alt="ShaderLab Logo" class="shaderlab-gizmo w-6 h-6" />
      <span class="shaderlab-brand font-semibold text-xl text-foreground"><span class="shaderlab-word">Shader</span><span class="shaderlab-accent">Lab</span></span>
    </a>
  </div>
{/if}
