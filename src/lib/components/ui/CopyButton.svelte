<script lang="ts">
  interface Props {
    text: string;
    label?: string;
    class?: string;
  }

  let { text, label = 'Copy', class: className = '' }: Props = $props();

  let copied = $state(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }
</script>

<button
  onclick={handleCopy}
  class="px-3 py-1.5 text-sm rounded-lg border-2 border-gold-500/30 text-gold-400 hover:bg-gold-500/10 transition-colors font-semibold uppercase tracking-wide {className}"
>
  {copied ? '✓ Copied!' : label}
</button>
