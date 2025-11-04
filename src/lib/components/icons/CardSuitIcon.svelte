<script lang="ts">
  interface Props {
    class?: string;
    size?: number;
  }

  let { class: className = '', size = 24 }: Props = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" class={className}>
  <path d="M12 2c-3 0-5 2-5 5 0 2 1 3 2 4-1 1-3 2-3 5 0 3 2 6 6 6s6-3 6-6c0-3-2-4-3-5 1-1 2-2 2-4 0-3-2-5-5-5Z" stroke="currentColor" stroke-width="2"/>
</svg>
