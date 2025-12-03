-- Migration: Clerk to Supabase Auth
-- This migration updates the database schema for Supabase Auth integration
-- Run this migration AFTER the application code is updated

-- ============================================================================
-- STEP 1: Rename clerk_user_id to auth_user_id in profiles
-- ============================================================================

ALTER TABLE public.profiles
  RENAME COLUMN clerk_user_id TO auth_user_id;

COMMENT ON COLUMN public.profiles.auth_user_id IS 'Supabase Auth user UUID (auth.users.id)';

-- Update index
DROP INDEX IF EXISTS idx_profiles_clerk_user;
CREATE INDEX IF NOT EXISTS idx_profiles_auth_user ON public.profiles(auth_user_id);

-- ============================================================================
-- STEP 2: Clean up sessions table (Supabase handles auth sessions)
-- ============================================================================

-- Remove Clerk-specific session tracking
ALTER TABLE public.sessions
  DROP COLUMN IF EXISTS clerk_session_id;

DROP INDEX IF EXISTS idx_sessions_clerk;

-- Note: We keep the sessions table for now as it stores active_game_account_id
-- This can be refactored later to use a separate mechanism

-- ============================================================================
-- STEP 3: Update RLS helper function to use Supabase Auth
-- ============================================================================

-- Create or replace the auth_profile_id function to use Supabase Auth
CREATE OR REPLACE FUNCTION auth_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()::text
$$;

-- ============================================================================
-- STEP 4: Update migration_status comment
-- ============================================================================

COMMENT ON COLUMN public.profiles.migration_status IS
  'Auth migration status: pending (legacy CDP), migrated (from Clerk to Supabase), new (Supabase native)';

-- ============================================================================
-- ROLLBACK (if needed):
--
-- ALTER TABLE public.profiles RENAME COLUMN auth_user_id TO clerk_user_id;
-- DROP INDEX IF EXISTS idx_profiles_auth_user;
-- CREATE INDEX IF NOT EXISTS idx_profiles_clerk_user ON public.profiles(clerk_user_id);
-- ALTER TABLE public.sessions ADD COLUMN clerk_session_id TEXT;
-- ============================================================================
