<script lang="ts">
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import AppSidebar from '$lib/components/SideBar.svelte';
  import MobileHeader from '$lib/components/MobileHeader.svelte';
  import '../App.css';
</script>

<Sidebar.Provider>
  <AppSidebar />
  <MobileHeader />
  <Sidebar.Inset class="flex flex-col h-screen sm:h-screen overflow-hidden pt-14 sm:pt-0">
    <main class="flex-1 flex flex-col min-h-0 overflow-hidden">
      <slot />
    </main>
    <footer class="flex justify-between items-center w-full p-3"></footer>
  </Sidebar.Inset>
</Sidebar.Provider>
