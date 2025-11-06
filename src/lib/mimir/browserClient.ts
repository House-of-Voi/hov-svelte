import { createClient } from '@supabase/supabase-js';
import { PUBLIC_MIMIR_SUPABASE_URL, PUBLIC_MIMIR_SUPABASE_ANON_KEY } from '$env/static/public';

// Browser-side Mimir Supabase client (uses anon key, respects RLS)

const mimirUrl = PUBLIC_MIMIR_SUPABASE_URL;
const mimirAnonKey = PUBLIC_MIMIR_SUPABASE_ANON_KEY;

if (!mimirUrl || !mimirAnonKey) {
  throw new Error(
    'Missing Mimir Supabase credentials. Set PUBLIC_MIMIR_SUPABASE_URL and PUBLIC_MIMIR_SUPABASE_ANON_KEY in your environment variables.'
  );
}

export const mimirBrowser = createClient(mimirUrl, mimirAnonKey, {
  auth: {
    persistSession: false
  }
});

