-- Migration: Add CDP recovery method and hint columns to game_accounts
-- Purpose: Store information about how users set up their gaming wallet
--          so they can unlock it if browser storage is cleared.
--
-- This is NOT authentication - it's metadata to help users remember
-- which method they used (email, SMS, or Google) to access their CDP wallet.

-- Add recovery method column
-- Values: 'email', 'sms', 'google'
ALTER TABLE public.game_accounts
ADD COLUMN IF NOT EXISTS cdp_recovery_method text;

-- Add obfuscated recovery hint column
-- Examples: "j***@g***.com", "***-***-1234", "Google account"
ALTER TABLE public.game_accounts
ADD COLUMN IF NOT EXISTS cdp_recovery_hint text;

-- Add check constraint for valid recovery methods
ALTER TABLE public.game_accounts
ADD CONSTRAINT game_accounts_cdp_recovery_method_check
CHECK (cdp_recovery_method IS NULL OR cdp_recovery_method IN ('email', 'sms', 'google'));

-- Comment on columns
COMMENT ON COLUMN public.game_accounts.cdp_recovery_method IS 'The CDP access method used to create this wallet: email, sms, or google';
COMMENT ON COLUMN public.game_accounts.cdp_recovery_hint IS 'Obfuscated identifier for UI hint during unlock (e.g., j***@g***.com)';
