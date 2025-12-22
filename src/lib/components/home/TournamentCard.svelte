<script lang="ts">
  interface Tournament {
    id?: string;
    name: string;
    image?: string;
    participantsCount?: number;
    href?: string;
  }

  interface Props {
    tournament: Tournament;
  }

  let { tournament }: Props = $props();

  // Default placeholder image
  const placeholderImage = 'https://www.figma.com/api/mcp/asset/cf8873ad-bdf9-42fe-9513-5d8e2d11ece2';
</script>

<div class="border border-white/15 rounded-2xl p-4 w-full">
  <div class="flex flex-col gap-4 items-start">
    <!-- Tournament Image -->
    <div class="w-full h-[150px] bg-[#808080] rounded-lg overflow-hidden">
      <img
        src={tournament.image || placeholderImage}
        alt={tournament.name}
        class="w-full h-full object-cover"
      />
    </div>

    <!-- Tournament Info -->
    <div class="flex flex-col gap-2 w-full">
      <p class="text-base font-medium text-white capitalize">
        {tournament.name}
      </p>
      <p class="text-sm text-white/70 capitalize">
        {tournament.participantsCount ?? 790} Participants
      </p>
    </div>

    <!-- Join Button -->
    <a
      href={tournament.href || '#'}
      class="w-full h-10 flex items-center justify-center rounded-full bg-[#333] border-2 border-[#808080] text-white text-base font-bold uppercase hover:bg-[#404040] transition-colors"
    >
      Join
    </a>
  </div>
</div>
