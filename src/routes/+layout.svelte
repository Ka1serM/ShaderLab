<script lang="ts">
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import AppSidebar from '$lib/components/SideBar.svelte';
  import '../app.css';

</script>

<Sidebar.Provider>
  <AppSidebar />

  <Sidebar.Inset class="flex flex-col min-h-screen">
    <main class="flex-1 flex flex-col min-h-0">
      <slot /> <!-- Renders page content -->
    </main>

    <footer class="flex justify-between items-center w-full p-3">
    </footer>
  </Sidebar.Inset>
</Sidebar.Provider>