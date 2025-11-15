-- Migration: Add game_type column to slot_machine_configs
-- Purpose: Distinguish between 5reel and w2w slot machine implementations
-- Date: 2025-11-14

-- Create enum for slot machine game types (different from general game_type enum)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'slot_game_type') THEN
    CREATE TYPE slot_game_type AS ENUM ('5reel', 'w2w');
  END IF;
END $$;

-- Add game_type column to slot_machine_configs
ALTER TABLE public.slot_machine_configs
ADD COLUMN IF NOT EXISTS game_type slot_game_type NOT NULL DEFAULT '5reel';

-- Create index for faster game type lookups
CREATE INDEX IF NOT EXISTS idx_slot_configs_game_type
ON public.slot_machine_configs (game_type);

-- Update existing records to be 5reel (default)
UPDATE public.slot_machine_configs
SET game_type = '5reel'
WHERE game_type IS NULL OR game_type = '5reel';

-- Add comment for documentation
COMMENT ON COLUMN public.slot_machine_configs.game_type IS
'Type of slot machine implementation: 5reel (traditional paylines) or w2w (ways to win)';
