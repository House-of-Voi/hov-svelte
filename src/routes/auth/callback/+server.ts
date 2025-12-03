import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAdminClient } from '$lib/db/supabaseAdmin';

/**
 * Auth callback handler for OAuth and magic link authentication
 *
 * This endpoint handles:
 * 1. OAuth redirects (Google, etc.)
 * 2. Magic link email verification
 *
 * After successful authentication:
 * - Exchanges the code for a session
 * - Creates or links the user's profile
 * - Redirects to /app
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/app';
  const error = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');

  // Handle auth errors
  if (error) {
    console.error('Auth callback error:', error, errorDescription);
    throw redirect(303, `/auth?error=${encodeURIComponent(error)}`);
  }

  if (code) {
    const { error: exchangeError } = await locals.supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error('Code exchange error:', exchangeError);
      throw redirect(303, '/auth?error=callback_failed');
    }

    // Get the authenticated user
    const {
      data: { user },
    } = await locals.supabase.auth.getUser();

    if (user) {
      await ensureProfileExists(user);
    }

    throw redirect(303, next);
  }

  // No code provided, redirect to auth page
  throw redirect(303, '/auth');
};

/**
 * Ensures a profile exists for the Supabase user.
 * If a profile with matching email exists, links it (migration).
 * Otherwise, creates a new profile.
 */
async function ensureProfileExists(user: {
  id: string;
  email?: string;
  user_metadata?: { full_name?: string; avatar_url?: string; name?: string };
}) {
  const supabase = createAdminClient();

  // Check if profile already exists by auth_user_id
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (existing) {
    // Profile already linked
    return;
  }

  // Check for existing profile by email (migration case)
  const email = user.email?.toLowerCase();
  if (email) {
    const { data: emailProfile } = await supabase
      .from('profiles')
      .select('id, auth_user_id')
      .eq('primary_email', email)
      .maybeSingle();

    if (emailProfile) {
      // Link existing profile to Supabase auth user
      if (!emailProfile.auth_user_id) {
        await supabase
          .from('profiles')
          .update({
            auth_user_id: user.id,
            migration_status: 'migrated',
          })
          .eq('id', emailProfile.id);
      }
      return;
    }
  }

  // Create new profile
  const displayName =
    user.user_metadata?.full_name || user.user_metadata?.name || null;
  const avatarUrl = user.user_metadata?.avatar_url || null;

  await supabase.from('profiles').insert({
    primary_email: email || `${user.id}@auth.local`,
    auth_user_id: user.id,
    display_name: displayName,
    avatar_url: avatarUrl,
    game_access_granted: false,
    waitlist_joined_at: new Date().toISOString(),
    migration_status: 'new',
  });
}
