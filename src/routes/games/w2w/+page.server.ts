import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ parent, url, locals }) => {
  const { session, hasGameAccess } = await parent();

  // Redirect to auth if not logged in
  if (!session) {
    throw redirect(302, '/auth');
  }

  const contractId = url.searchParams.get('contract');

  // Get CDP-derived Voi address from session (established by VoiAddressProvider)
  const voiAddress = locals.voiAddress;

  if (!voiAddress) {
    console.warn('No Voi address in session - VoiAddressProvider may not have run yet');
  }

  return {
    contractId,
    algorandAddress: voiAddress, // Return as algorandAddress for backward compatibility
    session, // Pass session through so component can access it
  };
};
