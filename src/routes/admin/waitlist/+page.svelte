<script lang="ts">
	import WaitlistAdminClient from '$lib/components/admin/WaitlistAdminClient.svelte';

	interface WaitlistReferralInfo {
		isActive: boolean;
		referrerName: string;
	}

	interface WaitlistUser {
		id: string;
		primary_email: string;
		display_name: string | null;
		waitlist_position: number | null;
		waitlist_joined_at: string | null;
		game_access_granted: boolean;
		created_at: string;
		referral: WaitlistReferralInfo | null;
	}

	interface PageData {
		waitlistUsers: WaitlistUser[];
		approvedCount: number;
		totalWaitlistCount: number;
		showReferredOnly: boolean;
	}

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Admin Waitlist - House of Voi</title>
</svelte:head>

<WaitlistAdminClient
	waitlistUsers={data.waitlistUsers}
	approvedCount={data.approvedCount}
	totalWaitlistCount={data.totalWaitlistCount}
	showReferredOnly={data.showReferredOnly}
/>
