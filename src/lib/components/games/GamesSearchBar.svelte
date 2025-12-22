<script lang="ts">
  import SearchIcon from '$lib/components/icons/SearchIcon.svelte';

  interface Props {
    value?: string;
    placeholder?: string;
    onInput?: (value: string) => void;
  }

  let { value = '', placeholder = 'Search', onInput }: Props = $props();

  function handleInput(event: Event) {
    const target = event.target as HTMLInputElement;
    value = target.value;
    onInput?.(value);
  }
</script>

<div class="relative w-full">
  <div class="absolute left-4 top-1/2 -translate-y-1/2 text-white/50 pointer-events-none">
    <SearchIcon size={24} />
  </div>
  <input
    type="text"
    {value}
    {placeholder}
    oninput={handleInput}
    class="w-full h-10 pl-12 pr-4 bg-[#333] border border-[#808080] rounded-2xl text-white placeholder-white/50 text-base focus:outline-none focus:border-white/50 transition-colors"
  />
</div>
