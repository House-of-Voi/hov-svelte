import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { requirePermission, PERMISSIONS } from '$lib/auth/admin';
import { createAdminClient } from '$lib/db/supabaseAdmin';
import type { ApiResponse } from '$lib/types/admin';

const schema = z.object({
  profileId: z.string().uuid(),
});

export const POST: RequestHandler = async ({ request, cookies }) => {
  try {
    await requirePermission(cookies, PERMISSIONS.GRANT_ACCESS);

    const payload = await request.json().catch(() => ({}));
    const parsed = schema.safeParse(payload);

    if (!parsed.success) {
      return json<ApiResponse>(
        { success: false, error: 'Invalid profile ID' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const { profileId } = parsed.data;

    const { data: profile } = await supabase
      .from('profiles')
      .select('deleted_at')
      .eq('id', profileId)
      .single();

    if (!profile) {
      return json<ApiResponse>(
        { success: false, error: 'Profile not found' },
        { status: 404 }
      );
    }

    if (profile.deleted_at) {
      return json<ApiResponse>(
        { success: false, error: 'Cannot grant access to deactivated users' },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        game_access_granted: true,
      })
      .eq('id', profileId)
      .is('deleted_at', null);

    if (updateError) {
      console.error('Failed to grant access:', updateError);
      return json<ApiResponse>(
        { success: false, error: 'Failed to grant game access' },
        { status: 500 }
      );
    }

    const { count: waitlistCount } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('game_access_granted', false)
      .is('deleted_at', null);

    return json<ApiResponse>(
      {
        success: true,
        data: { waitlist_count: waitlistCount || 0 },
        message: 'Game access granted successfully',
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('Error granting access:', error);

    if (error instanceof Error && (error.message.includes('UNAUTHORIZED') || error.message.includes('FORBIDDEN'))) {
      return json<ApiResponse>(
        { success: false, error: error.message },
        { status: error.message.includes('UNAUTHORIZED') ? 401 : 403 }
      );
    }

    return json<ApiResponse>(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
};
