-- Migration: Add YBT (Yield Bearing Token) support to slot_machine_configs
-- Purpose: Enable house treasury/pool management with YBT contracts
-- Date: 2025-11-14

-- Add ybt_app_id column (Algorand app ID for the YBT contract)
ALTER TABLE public.slot_machine_configs
ADD COLUMN IF NOT EXISTS ybt_app_id bigint;

-- Add ybt_asset_id column (Algorand asset ID for the YBT token)
ALTER TABLE public.slot_machine_configs
ADD COLUMN IF NOT EXISTS ybt_asset_id bigint;

-- Add unique constraint on ybt_app_id (each YBT contract can only be linked once)
ALTER TABLE public.slot_machine_configs
ADD CONSTRAINT slot_machine_configs_ybt_app_id_key UNIQUE (ybt_app_id);

-- Create index for YBT app lookups (only index non-null values)
CREATE INDEX IF NOT EXISTS idx_slot_configs_ybt_app
ON public.slot_machine_configs (ybt_app_id)
WHERE ybt_app_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.slot_machine_configs.ybt_app_id IS
'Algorand application ID for the YieldBearingToken contract that manages house pool deposits';

COMMENT ON COLUMN public.slot_machine_configs.ybt_asset_id IS
'Algorand asset ID for the YBT token (ARC200) - users receive YBT shares when depositing to house pool';
