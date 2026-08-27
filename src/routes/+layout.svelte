<script lang="ts">
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import AppSidebar from '$lib/components/SideBar.svelte';
  import MobileHeader from '$lib/components/MobileHeader.svelte';
  import { ModeWatcher } from "mode-watcher";
  import { checkStorageVersion } from '$lib/config';
  import '../App.css';

  checkStorageVersion();
</script>

<Sidebar.Provider>
  <!-- Global Tracker for Theme  -->
  <ModeWatcher defaultMode="light" />
  <AppSidebar />
  <MobileHeader />
  <Sidebar.Inset class="flex flex-col h-screen sm:h-screen overflow-hidden pt-14 sm:pt-0">
    <main class="flex-1 flex flex-col min-h-0 overflow-hidden">
      <slot />
    </main>
  </Sidebar.Inset>
</Sidebar.Provider>
