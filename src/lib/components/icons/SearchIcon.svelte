<script lang="ts">
  interface Props {
    size?: number;
    class?: string;
  }

  let { size = 24, class: className = '' }: Props = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  class={className}
  xmlns="http://www.w3.org/2000/svg"
>
  <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" />
  <path d="M20 20L16.5 16.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
</svg>
