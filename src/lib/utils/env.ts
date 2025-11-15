import { z } from 'zod';
import {
  PUBLIC_SUPABASE_URL,
  PUBLIC_SUPABASE_ANON_KEY,
  PUBLIC_CDP_PROJECT_ID,
  PUBLIC_CDP_API_KEY_NAME,
  PUBLIC_SWAP_API_URL,
  PUBLIC_MIMIR_SUPABASE_URL,
  PUBLIC_MIMIR_SUPABASE_ANON_KEY,
  PUBLIC_VOI_NODE_URL,
  PUBLIC_VOI_INDEXER_URL,
} from '$env/static/public';
import {
  NODE_ENV,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  CDP_API_KEY_PRIVATE_KEY,
} from '$env/static/private';

const ServerEnv = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).catch('development'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
  PUBLIC_MIMIR_SUPABASE_URL: z.string().url().optional(),
  PUBLIC_MIMIR_SUPABASE_ANON_KEY: z.string().min(10).optional(),
  PUBLIC_SUPABASE_URL: z.string().url(),
  PUBLIC_SUPABASE_ANON_KEY: z.string().min(10),
  PUBLIC_CDP_PROJECT_ID: z.string().min(1),
  PUBLIC_CDP_API_KEY_NAME: z.string().min(1),
  CDP_API_KEY_PRIVATE_KEY: z.string().min(10),
  // Voi Network Configuration
  PUBLIC_VOI_NODE_URL: z.string().url().optional(),
  PUBLIC_VOI_INDEXER_URL: z.string().url().optional(),
});

// Public environment variables (client-side accessible)
export const publicEnv = {
  SWAP_API_URL: PUBLIC_SWAP_API_URL || 'http://localhost:3000'
};

export const env = ServerEnv.parse({
  NODE_ENV,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  PUBLIC_MIMIR_SUPABASE_URL,
  PUBLIC_MIMIR_SUPABASE_ANON_KEY,
  PUBLIC_SUPABASE_URL,
  PUBLIC_SUPABASE_ANON_KEY,
  PUBLIC_CDP_PROJECT_ID,
  PUBLIC_CDP_API_KEY_NAME,
  CDP_API_KEY_PRIVATE_KEY,
  PUBLIC_VOI_NODE_URL,
  PUBLIC_VOI_INDEXER_URL,
});

export const DEMO_MODE = false;
