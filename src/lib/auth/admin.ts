/**
 * Admin authorization and permission management
 * Implements role-based access control with granular permissions
 */

import type { Cookies } from '@sveltejs/kit';
import { createAdminClient } from '$lib/db/supabaseAdmin';
import { createSupabaseServerClient } from '$lib/db/supabaseAuthServer';
import { getProfileByAuthUserId } from '$lib/profile/data';
import {
  getEffectivePermissions,
  type Permission,
  type AdminRole,
  type AdminRoleData,
} from './permissions';

// Re-export for convenience
export { getEffectivePermissions, PERMISSIONS, type Permission, type AdminRole, type AdminRoleData } from './permissions';

/**
 * Get the current user's profile ID from Supabase auth
 */
async function getProfileIdFromAuth(cookies: Cookies): Promise<string | null> {
  const supabase = createSupabaseServerClient(cookies);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const profile = await getProfileByAuthUserId(user.id);
  return profile?.id || null;
}

/**
 * Get the current user's admin role and permissions
 */
export async function getAdminRole(cookies: Cookies, profileId?: string): Promise<AdminRoleData | null> {
  try {
    let currentProfileId = profileId;

    // If no profile ID provided, get it from session
    if (!currentProfileId) {
      const authProfileId = await getProfileIdFromAuth(cookies);
      if (!authProfileId) {
        return null;
      }
      currentProfileId = authProfileId;
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('admin_roles')
      .select('*')
      .eq('profile_id', currentProfileId)
      .single();

    if (error || !data) {
      return null;
    }

    return data as AdminRoleData;
  } catch (error) {
    console.error('Error getting admin role:', error);
    return null;
  }
}

/**
 * Check if current user is an admin (has any admin role)
 */
export async function isAdmin(cookies: Cookies, profileId?: string): Promise<boolean> {
  const role = await getAdminRole(cookies, profileId);
  return role !== null;
}

/**
 * Check if user has a specific permission
 */
export async function hasPermission(
  cookies: Cookies,
  permission: Permission,
  profileId?: string
): Promise<boolean> {
  const roleData = await getAdminRole(cookies, profileId);
  if (!roleData) {
    return false;
  }

  const effectivePerms = getEffectivePermissions(roleData);
  return effectivePerms.includes(permission);
}

/**
 * Check if user has ALL of the specified permissions
 */
export async function hasAllPermissions(
  cookies: Cookies,
  permissions: Permission[],
  profileId?: string
): Promise<boolean> {
  const roleData = await getAdminRole(cookies, profileId);
  if (!roleData) {
    return false;
  }

  const effectivePerms = getEffectivePermissions(roleData);
  return permissions.every(p => effectivePerms.includes(p));
}

/**
 * Check if user has ANY of the specified permissions
 */
export async function hasAnyPermission(
  cookies: Cookies,
  permissions: Permission[],
  profileId?: string
): Promise<boolean> {
  const roleData = await getAdminRole(cookies, profileId);
  if (!roleData) {
    return false;
  }

  const effectivePerms = getEffectivePermissions(roleData);
  return permissions.some(p => effectivePerms.includes(p));
}

/**
 * Require admin role - throws if user is not an admin
 * Use in API routes to protect admin endpoints
 */
export async function requireAdmin(cookies: Cookies, profileId?: string): Promise<AdminRoleData> {
  const roleData = await getAdminRole(cookies, profileId);

  if (!roleData) {
    throw new Error('UNAUTHORIZED: Admin access required');
  }

  return roleData;
}

/**
 * Require specific permission - throws if user doesn't have it
 * Use in API routes to protect specific admin actions
 */
export async function requirePermission(
  cookies: Cookies,
  permission: Permission,
  profileId?: string
): Promise<AdminRoleData> {
  const roleData = await requireAdmin(cookies, profileId);
  const effectivePerms = getEffectivePermissions(roleData);

  if (!effectivePerms.includes(permission)) {
    throw new Error(`FORBIDDEN: Missing required permission: ${permission}`);
  }

  return roleData;
}

/**
 * Require specific role - throws if user doesn't have the required role level
 */
export async function requireRole(
  cookies: Cookies,
  requiredRole: AdminRole,
  profileId?: string
): Promise<AdminRoleData> {
  const roleData = await requireAdmin(cookies, profileId);

  const roleHierarchy: Record<AdminRole, number> = {
    viewer: 1,
    operator: 2,
    owner: 3,
  };

  if (roleHierarchy[roleData.role] < roleHierarchy[requiredRole]) {
    throw new Error(`FORBIDDEN: Required role: ${requiredRole}, current role: ${roleData.role}`);
  }

  return roleData;
}

/**
 * Get current profile ID from session cookie
 */
export async function getCurrentProfileId(cookies: Cookies): Promise<string | null> {
  return getProfileIdFromAuth(cookies);
}
