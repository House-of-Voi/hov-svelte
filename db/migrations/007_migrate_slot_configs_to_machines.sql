-- Migration 007: Migrate slot_machine_configs data to machines table
-- This migrates all existing slot machine configurations to the new unified machines table

-- Migrate existing data from slot_machine_configs to machines
INSERT INTO public.machines (
  id,
  name,
  display_name,
  description,
  theme,
  machine_type,
  chain,
  game_contract_id,
  treasury_contract_id,
  treasury_asset_id,
  config,
  rtp_target,
  house_edge,
  min_bet,
  max_bet,
  platform_fee_percent,
  platform_treasury_address,
  status,
  is_active,
  version,
  created_at,
  updated_at,
  launched_at,
  deprecated_at
)
SELECT
  id,
  name,
  display_name,
  description,
  theme,
  -- Map old game_type enum to new machine_type enum
  CASE game_type
    WHEN '5reel' THEN 'slots_5reel'::machine_type
    WHEN 'w2w' THEN 'slots_w2w'::machine_type
    ELSE 'slots_5reel'::machine_type  -- Default fallback
  END AS machine_type,
  chain,
  contract_id AS game_contract_id,
  ybt_app_id AS treasury_contract_id,
  ybt_asset_id AS treasury_asset_id,
  reel_config AS config,
  rtp_target,
  house_edge,
  min_bet,
  max_bet,
  0.00 AS platform_fee_percent,  -- Default: no platform fee for existing machines
  NULL AS platform_treasury_address,
  'active'::machine_status AS status,  -- Existing machines are already active
  is_active,
  version,
  created_at,
  updated_at,
  launched_at,
  deprecated_at
FROM public.slot_machine_configs;

-- Archive the original table (keep data for potential rollback)
ALTER TABLE public.slot_machine_configs RENAME TO slot_machine_configs_deprecated;

-- Add comment explaining the deprecation
COMMENT ON TABLE public.slot_machine_configs_deprecated IS 'DEPRECATED: Replaced by machines table. Data migrated in migration 007. Keep for rollback purposes.';

-- Note: The following tables reference contract_id by value (not FK), so no FK updates needed:
-- - treasury_balances (uses contract_id as lookup key)
-- - daily_stats (uses contract_id for stats aggregation)
-- These will continue to work since we preserved the same contract_id values in game_contract_id
