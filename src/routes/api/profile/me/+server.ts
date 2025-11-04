import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCurrentProfile } from '$lib/profile/session';
import { updateProfile } from '$lib/profile/data';
import { UpdateProfileSchema } from '$lib/profile/validation';

/**
 * GET /api/profile/me
 *
 * Returns the current authenticated user's profile with all linked accounts
 */
export const GET: RequestHandler = async ({ cookies }) => {
  try {
    const profileData = await getCurrentProfile(cookies);

    if (!profileData) {
      return json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    return json({
      success: true,
      data: profileData,
    });
  } catch (error) {
    console.error('Get profile error:', error);
    return json(
      {
        error: 'Failed to fetch profile',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
};

/**
 * PATCH /api/profile/me
 *
 * Updates the current authenticated user's profile
 *
 * Request body:
 * {
 *   display_name?: string | null,
 *   avatar_url?: string | null
 * }
 */
export const PATCH: RequestHandler = async ({ request, cookies }) => {
  try {
    const profileData = await getCurrentProfile(cookies);

    if (!profileData) {
      return json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = UpdateProfileSchema.safeParse(body);

    if (!parsed.success) {
      return json(
        {
          error: 'Invalid request body',
          details: parsed.error.errors,
        },
        { status: 400 }
      );
    }

    const { display_name, avatar_url } = parsed.data;

    // Build update object (only include provided fields)
    const updates: {
      display_name?: string | null;
      avatar_url?: string | null;
    } = {};

    if (display_name !== undefined) {
      updates.display_name = display_name;
    }

    if (avatar_url !== undefined) {
      updates.avatar_url = avatar_url;
    }

    // No updates provided
    if (Object.keys(updates).length === 0) {
      return json(
        { error: 'No updates provided' },
        { status: 400 }
      );
    }

    const updatedProfile = await updateProfile(profileData.profile.id, updates);

    if (!updatedProfile) {
      return json(
        { error: 'Failed to update profile' },
        { status: 500 }
      );
    }

    return json({
      success: true,
      data: {
        profile: updatedProfile,
      },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return json(
      {
        error: 'Failed to update profile',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
};
