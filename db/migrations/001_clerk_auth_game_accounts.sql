-- Migration: Clerk Authentication + Game Accounts System
-- This migration adds support for Clerk authentication and separates
-- game accounts (CDP wallets) from user authentication.

-- ============================================================================
-- NEW TABLE: game_accounts
-- Stores CDP wallet connections as "game accounts" separate from auth
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.game_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- CDP wallet info
  cdp_user_id text NOT NULL,
  base_address text NOT NULL,
  voi_address text NOT NULL,

  -- User-facing
  nickname text,
  is_default boolean NOT NULL DEFAULT false,
  last_unlocked_at timestamptz,

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Constraints: each CDP wallet can only be linked once
  UNIQUE(cdp_user_id),
  UNIQUE(base_address),
  UNIQUE(voi_address)
);

-- Indexes for game_accounts
CREATE INDEX IF NOT EXISTS idx_game_accounts_profile ON public.game_accounts(profile_id);
CREATE INDEX IF NOT EXISTS idx_game_accounts_voi ON public.game_accounts(voi_address);
CREATE INDEX IF NOT EXISTS idx_game_accounts_base ON public.game_accounts(base_address);
CREATE INDEX IF NOT EXISTS idx_game_accounts_default ON public.game_accounts(profile_id, is_default) WHERE is_default = true;

-- Updated at trigger for game_accounts
DROP TRIGGER IF EXISTS trg_game_accounts_updated_at ON public.game_accounts;
CREATE TRIGGER trg_game_accounts_updated_at
BEFORE UPDATE ON public.game_accounts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- MODIFY: profiles table
-- Add Clerk user ID for new authentication system
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS clerk_user_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS migration_status text DEFAULT 'pending';

COMMENT ON COLUMN public.profiles.clerk_user_id IS 'Clerk authentication user ID';
COMMENT ON COLUMN public.profiles.migration_status IS 'Auth migration status: pending, migrated, new';

CREATE INDEX IF NOT EXISTS idx_profiles_clerk_user ON public.profiles(clerk_user_id);

-- ============================================================================
-- MODIFY: sessions table
-- Add Clerk session tracking and active game account reference
-- ============================================================================

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS clerk_session_id text,
  ADD COLUMN IF NOT EXISTS active_game_account_id uuid REFERENCES public.game_accounts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.sessions.clerk_session_id IS 'Clerk session ID for session validation';
COMMENT ON COLUMN public.sessions.active_game_account_id IS 'Currently active game account for this session';

CREATE INDEX IF NOT EXISTS idx_sessions_clerk ON public.sessions(clerk_session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active_game_account ON public.sessions(active_game_account_id);

-- ============================================================================
-- RLS POLICIES: game_accounts
-- ============================================================================

ALTER TABLE public.game_accounts ENABLE ROW LEVEL SECURITY;

-- Users can read their own game accounts
DROP POLICY IF EXISTS p_game_accounts_owner_r ON public.game_accounts;
CREATE POLICY p_game_accounts_owner_r
ON public.game_accounts
FOR SELECT USING (profile_id = auth_profile_id());

-- Users can update their own game accounts (nickname, is_default)
DROP POLICY IF EXISTS p_game_accounts_update_owner ON public.game_accounts;
CREATE POLICY p_game_accounts_update_owner
ON public.game_accounts
FOR UPDATE USING (profile_id = auth_profile_id());

-- Users can delete their own game accounts
DROP POLICY IF EXISTS p_game_accounts_delete_owner ON public.game_accounts;
CREATE POLICY p_game_accounts_delete_owner
ON public.game_accounts
FOR DELETE USING (profile_id = auth_profile_id());

-- Server can insert game accounts
DROP POLICY IF EXISTS p_game_accounts_insert_server ON public.game_accounts;
CREATE POLICY p_game_accounts_insert_server
ON public.game_accounts
FOR INSERT
WITH CHECK (current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role');

-- Server has full access for admin operations
DROP POLICY IF EXISTS p_game_accounts_server_all ON public.game_accounts;
CREATE POLICY p_game_accounts_server_all
ON public.game_accounts
FOR ALL
USING (current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role');

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get the default game account for a profile
CREATE OR REPLACE FUNCTION get_default_game_account(p_profile_id uuid)
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id
  FROM public.game_accounts
  WHERE profile_id = p_profile_id
  AND is_default = true
  LIMIT 1;
$$;

-- Count game accounts for a profile
CREATE OR REPLACE FUNCTION count_game_accounts(p_profile_id uuid)
RETURNS int LANGUAGE sql STABLE AS $$
  SELECT COUNT(*)::int
  FROM public.game_accounts
  WHERE profile_id = p_profile_id;
$$;

-- Ensure only one default game account per profile
CREATE OR REPLACE FUNCTION ensure_single_default_game_account()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- If setting this account as default, unset others
  IF NEW.is_default = true THEN
    UPDATE public.game_accounts
    SET is_default = false
    WHERE profile_id = NEW.profile_id
    AND id != NEW.id
    AND is_default = true;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ensure_single_default_game_account ON public.game_accounts;
CREATE TRIGGER trg_ensure_single_default_game_account
BEFORE INSERT OR UPDATE OF is_default ON public.game_accounts
FOR EACH ROW
WHEN (NEW.is_default = true)
EXECUTE FUNCTION ensure_single_default_game_account();

-- Auto-set first game account as default
CREATE OR REPLACE FUNCTION auto_set_first_game_account_default()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- If this is the first game account for the profile, make it default
  IF NOT EXISTS (
    SELECT 1 FROM public.game_accounts
    WHERE profile_id = NEW.profile_id
    AND id != NEW.id
  ) THEN
    NEW.is_default := true;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_auto_set_first_game_account_default ON public.game_accounts;
CREATE TRIGGER trg_auto_set_first_game_account_default
BEFORE INSERT ON public.game_accounts
FOR EACH ROW
EXECUTE FUNCTION auto_set_first_game_account_default();
