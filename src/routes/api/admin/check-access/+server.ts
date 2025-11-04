/**
 * Admin access check endpoint
 * Returns current user's admin role and permissions
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAdminRole, getCurrentProfileId, getEffectivePermissions } from '$lib/auth/admin';
import type { AdminRoleResponse, ApiResponse } from '$lib/types/admin';

export const GET: RequestHandler = async ({ cookies }) => {
  try {
    const profileId = await getCurrentProfileId(cookies);

    if (!profileId) {
      return json<ApiResponse>(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const roleData = await getAdminRole(cookies, profileId);

    if (!roleData) {
      return json<ApiResponse>(
        { success: false, error: 'No admin access' },
        { status: 403 }
      );
    }

    const permissions = getEffectivePermissions(roleData);

    const response: AdminRoleResponse = {
      profile_id: roleData.profile_id,
      role: roleData.role,
      permissions,
      granted_by: roleData.granted_by,
      granted_at: roleData.granted_at,
    };

    return json<ApiResponse<AdminRoleResponse>>(
      { success: true, data: response },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error checking admin access:', error);
    return json<ApiResponse>(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
};
