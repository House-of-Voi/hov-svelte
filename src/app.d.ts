import type { SupabaseClient, Session, User } from '@supabase/supabase-js';
import type { SessionInfo, GameAccountInfo } from '$lib/auth/session';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			// Supabase auth
			supabase: SupabaseClient;
			supabaseSession: Session | null;
			supabaseUser: User | null;

			// House of Voi session (app-specific data built from Supabase auth)
			hovSession: SessionInfo | null;
			// Alias for hovSession - maintains backward compatibility with routes using locals.session
			session: SessionInfo | null;
			voiAddress?: string;
			gameAccounts?: GameAccountInfo[];
			activeGameAccount?: GameAccountInfo;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
