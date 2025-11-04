import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ parent }) => {
  const { session } = await parent();

  // Redirect to auth if not logged in
  if (!session) {
    throw redirect(302, '/auth');
  }

  // In a real implementation, we would fetch game history from the database
  // For now, return empty data - the component will show mock data
  return {};
};
