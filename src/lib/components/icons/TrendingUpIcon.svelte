<script lang="ts">
  interface Props {
    class?: string;
    size?: number;
  }

  let { class: className = '', size = 24 }: Props = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" class={className}>
  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <polyline points="17 6 23 6 23 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
