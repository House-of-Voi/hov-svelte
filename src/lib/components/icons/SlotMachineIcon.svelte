<script lang="ts">
  interface Props {
    class?: string;
    size?: number;
  }

  let { class: className = '', size = 24 }: Props = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" class={className}>
  <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" stroke-width="2"/>
  <circle cx="8" cy="10" r="1.5" fill="currentColor"/>
  <circle cx="12" cy="10" r="1.5" fill="currentColor"/>
  <circle cx="16" cy="10" r="1.5" fill="currentColor"/>
  <path d="M6 14h12M6 17h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>
