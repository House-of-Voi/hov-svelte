<script lang="ts">
  interface Props {
    image?: string;
    alt?: string;
    href?: string;
  }

  let { image, alt = 'Hero banner', href }: Props = $props();

  // Default placeholder image from Figma
  const placeholderImage = 'https://www.figma.com/api/mcp/asset/2046489e-8e3e-4f4b-a611-45e05e163b40';
</script>

{#if href}
  <a href={href} class="block w-full">
    <div class="w-full h-[500px] bg-[#808080] rounded-2xl overflow-hidden relative">
      <img
        src={image || placeholderImage}
        {alt}
        class="w-full h-full object-cover"
      />
      <!-- Gradient overlay for text readability if needed -->
      <div class="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none"></div>
    </div>
  </a>
{:else}
  <div class="w-full h-[500px] bg-[#808080] rounded-2xl overflow-hidden relative">
    <img
      src={image || placeholderImage}
      {alt}
      class="w-full h-full object-cover"
    />
    <!-- Gradient overlay for text readability if needed -->
    <div class="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none"></div>
  </div>
{/if}
