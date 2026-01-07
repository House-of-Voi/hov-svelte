-- Migration 005: Archive unused tables
-- These tables were placeholders and have no data being actively used
-- Archiving rather than dropping to preserve any potential historical value

-- Archive the games table (was a placeholder for game types, never connected to anything)
ALTER TABLE IF EXISTS public.games RENAME TO games_deprecated;

-- Archive the game_plays table (has 0 rows, was never used)
ALTER TABLE IF EXISTS public.game_plays RENAME TO game_plays_deprecated;

-- Add comments explaining why these are deprecated
COMMENT ON TABLE public.games_deprecated IS 'DEPRECATED: Placeholder game types table, never used. Archived in migration 005.';
COMMENT ON TABLE public.game_plays_deprecated IS 'DEPRECATED: Empty table, never used. Archived in migration 005.';
