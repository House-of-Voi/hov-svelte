-- Migration 009: Add deployment state and audit trail
-- Tracks deployment progress and allows recovery from interrupted deployments

-- Add deployment state column to persist progress
ALTER TABLE public.machines
  ADD COLUMN deployment_state JSONB DEFAULT NULL;

-- Add deployment log column for audit trail
ALTER TABLE public.machines
  ADD COLUMN deployment_log JSONB DEFAULT '[]'::jsonb;

-- Add last deployment attempt timestamp for rate limiting
ALTER TABLE public.machines
  ADD COLUMN last_deployment_attempt TIMESTAMPTZ DEFAULT NULL;

-- Add comments
COMMENT ON COLUMN public.machines.deployment_state IS 'Current deployment progress state. Contains gameAppId, treasuryAppId, currentPhase, deployerAddress for recovery.';
COMMENT ON COLUMN public.machines.deployment_log IS 'Audit trail of all deployment phases. Array of {phase, txid, timestamp, deployer, appId, status}.';
COMMENT ON COLUMN public.machines.last_deployment_attempt IS 'Timestamp of last deployment attempt for rate limiting.';

-- Create index for rate limiting queries
CREATE INDEX idx_machines_last_deployment ON public.machines(last_deployment_attempt)
  WHERE last_deployment_attempt IS NOT NULL;
