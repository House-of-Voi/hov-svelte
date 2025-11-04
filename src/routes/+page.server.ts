import { isAdmin } from '$lib/auth/admin';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
  // Check if the current user is an admin
  // Temporary: homepage options restricted to admins
  const isAdminUser = await isAdmin(cookies);

  return {
    isAdminUser
  };
};
