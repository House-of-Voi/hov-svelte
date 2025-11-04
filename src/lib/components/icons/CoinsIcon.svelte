<script lang="ts">
  interface Props {
    class?: string;
    size?: number;
  }

  let { class: className = '', size = 24 }: Props = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" class={className}>
  <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2"/>
  <path d="M18.09 10.37A6 6 0 1 1 10.34 18M14 16h6M17 13v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
