<script lang="ts">
	import { browser } from '$app/environment';
	import type { SessionInfo, GameAccountInfo } from '$lib/auth/session';

	interface Props {
		children: any;
		session?: SessionInfo | null;
		activeGameAccount?: GameAccountInfo | null;
	}

	let { children, session = null, activeGameAccount = null }: Props = $props();

	// With Supabase Auth, Voi address comes from the active game account
	// This component now primarily serves as a pass-through and context provider
	// The actual Voi address establishment happens when a game account is created/unlocked

	const voiAddress = $derived(
		session?.voiAddress || activeGameAccount?.voiAddress || null
	);

	// Log for debugging
	$effect(() => {
		if (browser && session) {
			if (voiAddress) {
				console.log('✅ Voi address available:', voiAddress);
			} else {
				console.log('⚠️ No Voi address available - user may need to create/unlock a game account');
			}
		}
	});
</script>

{@render children()}
