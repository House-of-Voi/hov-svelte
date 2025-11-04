<script lang="ts">
  import type { LayoutData } from './$types';
  import AdminNav from '$lib/components/admin/AdminNav.svelte';

  let { data, children }: { data: LayoutData; children: any } = $props();
</script>

<div class="min-h-screen bg-neutral-50 dark:bg-neutral-900">
  <AdminNav role={data.adminRole.role} permissions={data.adminRole.permissions} />
  <main class="mx-auto max-w-7xl px-6 py-8">
    <div class="space-y-8">
      {@render children()}
    </div>
  </main>
</div>
