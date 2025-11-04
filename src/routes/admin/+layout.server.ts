/**
 * Admin Layout Server
 *
 * Handles server-side authorization for admin routes
 * Checks:
 * 1. User is authenticated (has session)
 * 2. User has admin access (has admin role)
 *
 * Redirects unauthorized users to appropriate pages
 */

import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getAdminRole, getCurrentProfileId } from '$lib/auth/admin';

export const load: LayoutServerLoad = async ({ cookies }) => {
  // Check if user is authenticated
  const profileId = await getCurrentProfileId(cookies);

  if (!profileId) {
    // Not authenticated - redirect to auth page
    throw redirect(303, '/auth');
  }

  // Check if user has admin access
  const adminRole = await getAdminRole(cookies, profileId);

  if (!adminRole) {
    // Authenticated but not an admin - redirect to main app
    throw redirect(303, '/app');
  }

  // User is authenticated and has admin access
  return {
    adminRole: {
      role: adminRole.role,
      permissions: adminRole.permissions,
      profileId: adminRole.profile_id,
      grantedBy: adminRole.granted_by,
      grantedAt: adminRole.granted_at,
    },
  };
};
