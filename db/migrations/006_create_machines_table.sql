-- Migration 006: Create machines table
-- This replaces slot_machine_configs with a game-agnostic design
-- Supports slots, keno, roulette, and future game types

-- Create machine type enum (game types)
CREATE TYPE machine_type AS ENUM (
  'slots_5reel',    -- Classic 5-reel slot machine
  'slots_w2w',      -- Ways to win slot machine
  'keno',           -- Keno lottery game
  'roulette'        -- Roulette wheel game
  -- Future: 'blackjack', 'baccarat', 'crash', 'dice', etc.
);

-- Create machine status enum (deployment lifecycle)
CREATE TYPE machine_status AS ENUM (
  'draft',           -- Configuration created, not yet deployed
  'deploying',       -- Deployment transaction in progress
  'bootstrapping',   -- Contracts created, running bootstrap calls
  'active',          -- Fully deployed and operational
  'paused',          -- Temporarily disabled (admin action)
  'failed',          -- Deployment failed
  'deprecated'       -- No longer in use, archived
);

-- Create main machines table
CREATE TABLE public.machines (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  theme TEXT,

  -- Type & Chain
  machine_type machine_type NOT NULL,
  chain chain_type NOT NULL DEFAULT 'voi',

  -- Contract IDs (on-chain identifiers)
  game_contract_id BIGINT UNIQUE,          -- Main game contract app ID (e.g., SlotMachine)
  treasury_contract_id BIGINT UNIQUE,      -- Treasury contract app ID (e.g., YieldBearingToken)
  treasury_asset_id BIGINT,                -- Optional: ARC200 token asset ID

  -- Game Configuration
  config JSONB NOT NULL DEFAULT '{}',      -- Game-specific config (reels, paylines, payouts, etc.)
  rtp_target NUMERIC(5,2) CHECK (rtp_target >= 0 AND rtp_target <= 100),
  house_edge NUMERIC(5,2) CHECK (house_edge >= 0 AND house_edge <= 100),
  min_bet BIGINT NOT NULL,
  max_bet BIGINT NOT NULL,

  -- Platform Economics
  platform_fee_percent NUMERIC(5,2) DEFAULT 0.00
    CHECK (platform_fee_percent >= 0 AND platform_fee_percent <= 100),
  platform_treasury_address TEXT,

  -- Status & Lifecycle
  status machine_status NOT NULL DEFAULT 'draft',
  is_active BOOLEAN NOT NULL DEFAULT false,
  version INTEGER NOT NULL DEFAULT 1,

  -- Deployment Tracking
  created_by UUID REFERENCES public.profiles(id),
  deployment_tx_id TEXT,
  deployment_error TEXT,
  deployment_started_at TIMESTAMPTZ,
  deployment_completed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  launched_at TIMESTAMPTZ,
  deprecated_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT valid_bet_range CHECK (min_bet <= max_bet),
  CONSTRAINT active_requires_contracts CHECK (
    NOT is_active OR (game_contract_id IS NOT NULL AND status = 'active')
  )
);

-- Create indexes for common query patterns
CREATE INDEX idx_machines_type ON public.machines(machine_type);
CREATE INDEX idx_machines_status ON public.machines(status);
CREATE INDEX idx_machines_chain ON public.machines(chain);
CREATE INDEX idx_machines_created_by ON public.machines(created_by);
CREATE INDEX idx_machines_is_active ON public.machines(is_active);
CREATE INDEX idx_machines_game_contract ON public.machines(game_contract_id) WHERE game_contract_id IS NOT NULL;
CREATE INDEX idx_machines_treasury_contract ON public.machines(treasury_contract_id) WHERE treasury_contract_id IS NOT NULL;

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_machines_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER machines_updated_at
  BEFORE UPDATE ON public.machines
  FOR EACH ROW
  EXECUTE FUNCTION update_machines_updated_at();

-- Enable Row Level Security
ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Public can read active machines
CREATE POLICY machines_public_read ON public.machines
  FOR SELECT
  USING (is_active = true AND status = 'active');

-- RLS Policy: Admins can read all machines
CREATE POLICY machines_admin_read ON public.machines
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles
      WHERE profile_id = (SELECT auth.uid())
    )
  );

-- RLS Policy: Operators and owners can insert/update/delete
CREATE POLICY machines_admin_write ON public.machines
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles
      WHERE profile_id = (SELECT auth.uid())
      AND role IN ('owner', 'operator')
    )
  );

-- Add table comment
COMMENT ON TABLE public.machines IS 'Game machines configuration and deployment tracking. Each row represents a deployed game instance (slot machine, keno, roulette, etc.) with its on-chain contract IDs and settings.';

-- Add column comments
COMMENT ON COLUMN public.machines.game_contract_id IS 'Algorand application ID for the main game contract (e.g., SlotMachine, KenoGame)';
COMMENT ON COLUMN public.machines.treasury_contract_id IS 'Algorand application ID for the treasury/YBT contract that manages house pool deposits';
COMMENT ON COLUMN public.machines.treasury_asset_id IS 'Optional ARC200 token asset ID if the treasury issues transferable shares';
COMMENT ON COLUMN public.machines.config IS 'Game-specific configuration as JSON. For slots: reels, paylines, symbols, payouts. For keno: pick range, payout table. For roulette: bet types, layout.';
COMMENT ON COLUMN public.machines.platform_fee_percent IS 'Percentage of each bet that goes to the platform treasury (0-100)';
COMMENT ON COLUMN public.machines.status IS 'Deployment lifecycle: draft -> deploying -> bootstrapping -> active/failed';
