<script lang="ts">
  interface Props {
    title?: string;
    detail?: string;
  }

  let { title = 'PLACEHOLDER', detail }: Props = $props();
</script>

<div class="placeholder">
  <div class="font-semibold">{title}</div>
  <p class="mt-2">{detail ?? 'This feature is not implemented yet.'}</p>
</div>
