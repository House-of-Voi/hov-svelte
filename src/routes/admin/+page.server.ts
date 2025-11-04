import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  // Check if user has admin permissions
  // TODO: Implement proper permission checking with PERMISSIONS.VIEW_ANALYTICS
  // For now, just check if user is authenticated

  if (!locals.session) {
    throw redirect(303, '/login');
  }

  // TODO: Add admin role/permission check here
  // const hasPermission = await checkPermission(locals.session.profile_id, 'VIEW_ANALYTICS');
  // if (!hasPermission) {
  //   throw redirect(303, '/');
  // }

  return {};
};
