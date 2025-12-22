<script lang="ts">
  import type { StatsPeriod } from '$lib/types/profile';
  import ChevronDownIcon from '$lib/components/icons/ChevronDownIcon.svelte';

  interface Props {
    period: StatsPeriod;
    selectedDate: Date;
    onPeriodChange: (period: StatsPeriod) => void;
    onDateChange: (date: Date) => void;
  }

  let { period, selectedDate, onPeriodChange, onDateChange }: Props = $props();

  // Format date for display (MM / DD / YYYY)
  function formatDateDisplay(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    return `${month} / ${day} / ${year}`;
  }

  // Format date for input value (YYYY-MM-DD)
  function formatDateInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function handleDateInput(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.value) {
      const newDate = new Date(target.value + 'T00:00:00');
      onDateChange(newDate);
    }
  }

  let dateInputRef = $state<HTMLInputElement | null>(null);

  function openDatePicker() {
    dateInputRef?.showPicker?.();
  }
</script>

<div class="flex gap-2 items-start w-full">
  <!-- All Time Button -->
  <button
    type="button"
    onclick={() => onPeriodChange('all')}
    class="flex gap-1 items-center h-8 px-2 rounded-full transition-colors {period === 'all'
      ? 'bg-[#808080] border-2 border-[#b2b2b2]'
      : 'bg-[#333] border-2 border-[#808080]'}"
  >
    <!-- Radio dot -->
    <div class="size-4 rounded-full border-2 {period === 'all' ? 'border-white bg-white' : 'border-white/50'}">
      {#if period === 'all'}
        <div class="w-full h-full rounded-full bg-white"></div>
      {/if}
    </div>
    <span class="text-sm font-medium text-white uppercase">All Time</span>
  </button>

  <!-- Daily Button -->
  <button
    type="button"
    onclick={() => onPeriodChange('daily')}
    class="flex gap-2 items-center h-8 px-2 rounded-full transition-colors {period === 'daily'
      ? 'bg-[#808080] border-2 border-[#b2b2b2]'
      : 'bg-[#333] border-2 border-[#808080]'}"
  >
    <!-- Radio dot -->
    <div class="size-4 rounded-full border-2 {period === 'daily' ? 'border-white bg-white' : 'border-white/50'}">
      {#if period === 'daily'}
        <div class="w-full h-full rounded-full bg-white"></div>
      {/if}
    </div>
    <span class="text-sm font-medium text-white uppercase">Daily</span>
  </button>

  <!-- Date Picker (visible when Daily is selected) -->
  {#if period === 'daily'}
    <button
      type="button"
      onclick={openDatePicker}
      class="flex-1 flex gap-1 items-center h-8 px-2 bg-[#333] border-2 border-[#808080] rounded-full hover:bg-[#404040] transition-colors"
    >
      <span class="flex-1 text-sm font-medium text-white uppercase whitespace-pre-wrap text-left">
        {formatDateDisplay(selectedDate)}
      </span>
      <ChevronDownIcon size={24} class="text-white shrink-0" />
    </button>
    <!-- Hidden date input -->
    <input
      type="date"
      bind:this={dateInputRef}
      value={formatDateInput(selectedDate)}
      max={formatDateInput(new Date())}
      onchange={handleDateInput}
      class="sr-only"
    />
  {/if}
</div>
