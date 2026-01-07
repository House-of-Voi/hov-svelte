-- Migration 010: Create tokens table for multi-token support
-- Tracks supported tokens across chains with metadata and whitelist status

-- Create token standard enum
CREATE TYPE token_standard AS ENUM (
  'native',        -- Native chain token (VOI, ETH, SOL)
  'voi_asa',       -- Voi ASA (Algorand Standard Asset)
  'voi_arc200',    -- Voi ARC200 token
  'base_erc20',    -- Base ERC20 token
  'solana_spl'     -- Solana SPL token
);

-- Create tokens table
CREATE TABLE public.tokens (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Chain and contract info
  chain chain_type NOT NULL,  -- Uses existing chain_type enum (voi, base, solana)
  contract_id BIGINT,         -- NULL for native tokens
  token_standard token_standard NOT NULL,

  -- Token metadata
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  decimals INTEGER NOT NULL DEFAULT 6,
  icon_url TEXT,

  -- Display settings (override metadata for UI)
  display_symbol TEXT,        -- Override symbol for display (e.g., "USDC" for aUSDC)
  display_name TEXT,          -- Override name for display

  -- Status flags
  is_active BOOLEAN NOT NULL DEFAULT true,       -- Token is operational
  is_displayable BOOLEAN NOT NULL DEFAULT false, -- Show in wallet balances
  is_game_enabled BOOLEAN NOT NULL DEFAULT false,-- Can be used for betting
  is_treasury_enabled BOOLEAN NOT NULL DEFAULT false, -- Can be used for house pool deposits

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  UNIQUE (chain, contract_id),
  CONSTRAINT valid_native_token CHECK (
    (token_standard = 'native' AND contract_id IS NULL) OR
    (token_standard != 'native' AND contract_id IS NOT NULL)
  )
);

-- Indexes for common query patterns
CREATE INDEX idx_tokens_chain ON public.tokens(chain);
CREATE INDEX idx_tokens_active ON public.tokens(is_active);
CREATE INDEX idx_tokens_displayable ON public.tokens(is_displayable) WHERE is_displayable = true;
CREATE INDEX idx_tokens_game_enabled ON public.tokens(is_game_enabled) WHERE is_game_enabled = true;
CREATE INDEX idx_tokens_treasury_enabled ON public.tokens(is_treasury_enabled) WHERE is_treasury_enabled = true;
CREATE INDEX idx_tokens_contract ON public.tokens(contract_id) WHERE contract_id IS NOT NULL;
CREATE INDEX idx_tokens_symbol ON public.tokens(symbol);

-- Updated_at trigger (reuse existing function from machines table)
CREATE TRIGGER tokens_updated_at
  BEFORE UPDATE ON public.tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_machines_updated_at();

-- Enable Row Level Security
ALTER TABLE public.tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Anyone can read active, displayable tokens
CREATE POLICY tokens_public_read ON public.tokens
  FOR SELECT
  USING (is_active = true AND is_displayable = true);

-- RLS Policy: Service role can do everything (admins use service role key)
CREATE POLICY tokens_service_role ON public.tokens
  FOR ALL
  USING (current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role');

-- Table and column comments
COMMENT ON TABLE public.tokens IS 'Registry of supported tokens across chains. Stores metadata and whitelist status for balance display, game betting, and treasury deposits.';
COMMENT ON COLUMN public.tokens.contract_id IS 'On-chain contract/app ID. NULL for native chain tokens (VOI, ETH, SOL).';
COMMENT ON COLUMN public.tokens.token_standard IS 'Token standard type - determines how to interact with the token on-chain.';
COMMENT ON COLUMN public.tokens.display_symbol IS 'Override symbol for UI display (e.g., show "USDC" instead of "aUSDC").';
COMMENT ON COLUMN public.tokens.is_displayable IS 'Token appears in wallet balance displays.';
COMMENT ON COLUMN public.tokens.is_game_enabled IS 'Token can be used for game bets.';
COMMENT ON COLUMN public.tokens.is_treasury_enabled IS 'Token can be deposited to house pool treasuries.';
