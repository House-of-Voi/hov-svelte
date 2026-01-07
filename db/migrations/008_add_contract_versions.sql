-- Migration 008: Add contract version tracking
-- Each machine tracks which version of the game and treasury contracts it uses
-- This allows supporting multiple contract versions as new features are added

-- Add contract version columns to machines table
ALTER TABLE public.machines
  ADD COLUMN game_contract_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN treasury_contract_version INTEGER NOT NULL DEFAULT 1;

-- Add constraints for valid version numbers
ALTER TABLE public.machines
  ADD CONSTRAINT valid_game_contract_version CHECK (game_contract_version >= 1),
  ADD CONSTRAINT valid_treasury_contract_version CHECK (treasury_contract_version >= 1);

-- Add comments
COMMENT ON COLUMN public.machines.game_contract_version IS 'Version of the game contract (e.g., SlotMachineW2W v1, v2). Used to select correct client for deployment and interaction.';
COMMENT ON COLUMN public.machines.treasury_contract_version IS 'Version of the treasury/YBT contract. Used to select correct client for deployment and interaction.';

-- Create index for version queries
CREATE INDEX idx_machines_game_version ON public.machines(machine_type, game_contract_version);
