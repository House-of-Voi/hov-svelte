-- Migration 011: Seed initial tokens
-- Adds currently supported tokens to the tokens table

INSERT INTO public.tokens (
  chain,
  contract_id,
  token_standard,
  symbol,
  name,
  decimals,
  display_symbol,
  display_name,
  is_active,
  is_displayable,
  is_game_enabled,
  is_treasury_enabled
) VALUES
  -- Native VOI - the primary chain token
  (
    'voi',
    NULL,
    'native',
    'VOI',
    'Voi',
    6,
    NULL,
    NULL,
    true,
    true,
    true,
    true
  ),
  -- aUSDC - Algorand bridged USDC (displayed as USDC)
  (
    'voi',
    302190,
    'voi_arc200',
    'aUSDC',
    'Algorand Bridged USDC',
    6,
    'USDC',
    'USDC',
    true,
    true,
    false,
    false
  ),
  -- UNIT - Community token
  (
    'voi',
    420069,
    'voi_arc200',
    'UNIT',
    'Unit',
    6,
    NULL,
    NULL,
    true,
    true,
    false,
    false
  ),
  -- WAD - Game-enabled token for WAD machine
  (
    'voi',
    47138068,
    'voi_arc200',
    'WAD',
    'WAD Token',
    6,
    NULL,
    NULL,
    true,
    true,
    true,
    true
  );
