import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createAdminClient } from '$lib/db/supabaseAdmin';
import { requirePermission, getCurrentProfileId, PERMISSIONS } from '$lib/auth/admin';
import type { Machine } from '$lib/types/database';

export const load: PageServerLoad = async ({ params, cookies }) => {
  const profileId = await getCurrentProfileId(cookies);
  if (!profileId) {
    throw error(401, 'Authentication required');
  }

  try {
    await requirePermission(cookies, PERMISSIONS.VIEW_GAMES, profileId);
  } catch {
    throw error(403, 'Permission denied');
  }

  const { id } = params;

  if (!id) {
    throw error(400, 'Machine ID is required');
  }

  const supabase = createAdminClient();

  const { data: machine, error: dbError } = await supabase
    .from('machines')
    .select('*')
    .eq('id', id)
    .single();

  if (dbError) {
    if (dbError.code === 'PGRST116') {
      throw error(404, 'Machine not found');
    }
    console.error('Error fetching machine:', { id, error: dbError.message });
    throw error(500, 'Failed to fetch machine');
  }

  return {
    machine: machine as Machine
  };
};
