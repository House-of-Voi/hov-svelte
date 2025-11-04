import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { requirePermission, PERMISSIONS } from '$lib/auth/admin';
import { createAdminClient } from '$lib/db/supabaseAdmin';
import type { WaitlistReorderResponse, PlayerListItem, ApiResponse } from '$lib/types/admin';

const positionUpdateSchema = z.object({
  profileId: z.string().uuid(),
  newPosition: z.number().int().positive(),
});

const requestSchema = z.object({
  updates: z.array(positionUpdateSchema).min(1),
});

export const POST: RequestHandler = async ({ request, cookies }) => {
  try {
    await requirePermission(cookies, PERMISSIONS.MANAGE_WAITLIST);

    const payload = await request.json().catch(() => ({}));
    const parsed = requestSchema.safeParse(payload);

    if (!parsed.success) {
      return json<ApiResponse>(
        { success: false, error: 'Invalid request data' },
        { status: 400 }
      );
    }

    const { updates } = parsed.data;
    const positions = updates.map((u) => u.newPosition);
    const uniquePositions = new Set(positions);

    if (positions.length !== uniquePositions.size) {
      return json<ApiResponse>(
        { success: false, error: 'Duplicate positions are not allowed' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const profileIds = updates.map((u) => u.profileId);

    const { data: profiles, error: fetchError } = await supabase
      .from('profiles')
      .select('id, game_access_granted, deleted_at')
      .in('id', profileIds);

    if (fetchError) {
      console.error('Failed to fetch profiles:', fetchError);
      return json<ApiResponse>(
        { success: false, error: 'Failed to validate profiles' },
        { status: 500 }
      );
    }

    if (!profiles || profiles.length !== profileIds.length) {
      return json<ApiResponse>(
        { success: false, error: 'One or more profile IDs not found' },
        { status: 404 }
      );
    }

    const invalidProfiles = profiles.filter(
      (p) => p.game_access_granted || p.deleted_at
    );

    if (invalidProfiles.length > 0) {
      return json<ApiResponse>(
        { success: false, error: 'Cannot reorder users who are not on the waitlist' },
        { status: 400 }
      );
    }

    const { error: clearError } = await supabase
      .from('profiles')
      .update({ waitlist_position: null })
      .in('id', profileIds);

    if (clearError) {
      console.error('Failed to clear positions:', clearError);
      return json<ApiResponse>(
        { success: false, error: 'Failed to update positions' },
        { status: 500 }
      );
    }

    for (const update of updates) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ waitlist_position: update.newPosition })
        .eq('id', update.profileId);

      if (updateError) {
        console.error('Failed to update position:', updateError);
        await supabase.rpc('recalculate_waitlist_positions');
        return json<ApiResponse>(
          { success: false, error: 'Failed to update positions, attempting recovery' },
          { status: 500 }
        );
      }
    }

    const { error: recalcError } = await supabase.rpc('recalculate_waitlist_positions');

    if (recalcError) {
      console.error('Failed to recalculate positions:', recalcError);
    }

    const { data: waitlist, error: waitlistError } = await supabase
      .from('profiles')
      .select(
        `
        id,
        primary_email,
        display_name,
        avatar_url,
        game_access_granted,
        waitlist_position,
        waitlist_joined_at,
        created_at,
        accounts (
          chain,
          address,
          is_primary
        )
      `
      )
      .eq('game_access_granted', false)
      .is('deleted_at', null)
      .order('waitlist_position', { ascending: true, nullsFirst: false });

    if (waitlistError) {
      console.error('Failed to fetch updated waitlist:', waitlistError);
      return json<ApiResponse>(
        { success: false, error: 'Positions updated but failed to fetch waitlist' },
        { status: 500 }
      );
    }

    const response: WaitlistReorderResponse = {
      success: true,
      updated_count: updates.length,
      waitlist: (waitlist as unknown as PlayerListItem[]) || [],
    };

    return json<ApiResponse<WaitlistReorderResponse>>(
      { success: true, data: response },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('Unexpected error during reorder:', error);

    if (error instanceof Error && (error.message.includes('UNAUTHORIZED') || error.message.includes('FORBIDDEN'))) {
      return json<ApiResponse>(
        { success: false, error: error.message },
        { status: error.message.includes('UNAUTHORIZED') ? 401 : 403 }
      );
    }

    return json<ApiResponse>(
      { success: false, error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
};
