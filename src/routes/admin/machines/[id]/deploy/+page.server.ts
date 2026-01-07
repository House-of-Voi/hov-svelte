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
    // Require deploy permission for deploy page
    await requirePermission(cookies, PERMISSIONS.DEPLOY_MACHINES, profileId);
  } catch {
    throw error(403, 'Deploy permission required');
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

  const typedMachine = machine as Machine;

  // Validate machine can be deployed
  if (typedMachine.status !== 'draft' && typedMachine.status !== 'deploying' && typedMachine.status !== 'bootstrapping' && typedMachine.status !== 'failed') {
    throw error(400, `Machine cannot be deployed in current status: ${typedMachine.status}`);
  }

  return {
    machine: typedMachine
  };
};
