import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { getCurrentAlgorandAccount } from '$lib/auth/session';

export const load: PageServerLoad = async ({ parent, url, cookies }) => {
  const { session, hasGameAccess } = await parent();

  // Redirect to auth if not logged in
  if (!session) {
    throw redirect(302, '/auth');
  }

  // Allow viewing even on waitlist (layout will show waitlist info)
  // but could redirect to games lobby if desired
  // if (!hasGameAccess) {
  //   throw redirect(302, '/games');
  // }

  const contractId = url.searchParams.get('contract');

  // Fetch Algorand/Voi wallet address for game transactions
  let algorandAddress: string | null = null;
  try {
    const algorandAccount = await getCurrentAlgorandAccount(cookies);
    algorandAddress = algorandAccount?.address || null;

    if (!algorandAddress) {
      console.warn('No Algorand address found for user');
    }
  } catch (error) {
    console.error('Failed to fetch Algorand address:', error);
  }

  return {
    contractId,
    algorandAddress,
  };
};
