import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createAdminClient } from '$lib/db/supabaseAdmin';
import type { ReferralDashboardData } from '$lib/referrals/credits';

export const load: PageServerLoad = async ({ locals, url }) => {
  const session = locals.hovSession;
  if (!session) {
    throw redirect(302, '/auth');
  }

  // Check if user has referral capability
  const supabase = createAdminClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('max_referrals')
    .eq('id', session.sub)
    .single();

  if (!profile || profile.max_referrals === 0) {
    // User doesn't have referral capability, redirect to app
    throw redirect(302, '/app');
  }

  // Try to fetch dashboard data server-side (optional, can be client-side)
  // For now, we'll let the client fetch it to avoid blocking the page load
  // due to potential Mimir API slowness
  const contractIdParam = url.searchParams.get('contractId');
  const contractId = contractIdParam ? parseInt(contractIdParam, 10) : undefined;

  return {
    contractId,
  };
};
