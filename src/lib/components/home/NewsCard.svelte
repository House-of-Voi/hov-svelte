<script lang="ts">
  interface NewsItem {
    id?: string;
    title: string;
    text: string;
    image?: string;
    href?: string;
  }

  interface Props {
    news: NewsItem;
  }

  let { news }: Props = $props();

  // Default placeholder image
  const placeholderImage = 'https://www.figma.com/api/mcp/asset/5c37d489-0037-4828-a9b9-7ca694653134';
</script>

<a href={news.href || '#'} class="flex-1 min-w-0 group">
  <div class="flex flex-col gap-4 h-[210px]">
    <!-- News Image -->
    <div class="w-full h-[150px] bg-[#808080] rounded-lg overflow-hidden flex-shrink-0">
      <img
        src={news.image || placeholderImage}
        alt={news.title}
        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
      />
    </div>

    <!-- News Info -->
    <div class="flex flex-col gap-2 capitalize">
      <p class="text-base font-medium text-white truncate">
        {news.title}
      </p>
      <p class="text-sm text-white/70 truncate">
        {news.text}
      </p>
    </div>
  </div>
</a>
