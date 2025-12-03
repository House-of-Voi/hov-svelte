<script lang="ts">
  import { page } from '$app/stores';
  import { Auth } from '@supabase/auth-ui-svelte';
  import { ThemeSupa } from '@supabase/auth-ui-shared';
  import { supabaseBrowser } from '$lib/db/supabaseClient';
  import { browser } from '$app/environment';

  // Check for expired session redirect
  const isExpired = $derived($page.url.searchParams.get('expired') === 'true');
  const errorParam = $derived($page.url.searchParams.get('error'));

  // Build redirect URL for OAuth callbacks
  const redirectTo = $derived(
    browser ? `${window.location.origin}/auth/callback` : '/auth/callback'
  );
</script>

<svelte:head>
  <title>Sign In - House of Voi</title>
</svelte:head>

<div class="min-h-[80vh] flex items-center justify-center py-12">
  <div class="w-full max-w-md space-y-8">
    <!-- Header -->
    <div class="text-center space-y-2">
      <h1 class="text-4xl font-black text-warning-500 dark:text-warning-400 neon-text uppercase">
        Welcome
      </h1>
      <p class="text-neutral-600 dark:text-neutral-400">
        Sign in or create your account
      </p>
    </div>

    <!-- Session Expired Warning -->
    {#if isExpired}
      <div
        class="p-4 rounded-xl text-center font-semibold bg-warning-100 dark:bg-warning-500/20 text-warning-600 dark:text-warning-400 border border-warning-300 dark:border-warning-500/30"
      >
        Your session has expired. Please sign in again.
      </div>
    {/if}

    <!-- Auth Error -->
    {#if errorParam}
      <div
        class="p-4 rounded-xl text-center font-semibold bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-500/30"
      >
        Authentication failed. Please try again.
      </div>
    {/if}

    <!-- Supabase Auth UI -->
    <div class="supabase-auth-container">
      <Auth
        supabaseClient={supabaseBrowser}
        appearance={{
          theme: ThemeSupa,
          variables: {
            default: {
              colors: {
                brand: '#f59e0b',
                brandAccent: '#d97706',
                brandButtonText: '#171717',
                inputBackground: 'transparent',
                inputBorder: '#404040',
                inputBorderFocus: '#f59e0b',
                inputBorderHover: '#525252',
              },
              borderWidths: {
                buttonBorderWidth: '1px',
                inputBorderWidth: '1px',
              },
              radii: {
                borderRadiusButton: '0.75rem',
                buttonBorderRadius: '0.75rem',
                inputBorderRadius: '0.75rem',
              },
            },
          },
          className: {
            container: 'auth-container',
            button: 'auth-button',
            input: 'auth-input',
          },
        }}
        providers={['google']}
        magicLink={true}
        {redirectTo}
        localization={{
          variables: {
            sign_in: {
              email_label: 'Email',
              password_label: 'Password',
              button_label: 'Sign In',
              social_provider_text: 'Continue with {{provider}}',
              link_text: "Don't have an account? Sign up",
            },
            sign_up: {
              email_label: 'Email',
              password_label: 'Password',
              button_label: 'Sign Up',
              social_provider_text: 'Continue with {{provider}}',
              link_text: 'Already have an account? Sign in',
            },
            magic_link: {
              email_input_label: 'Email',
              button_label: 'Send Magic Link',
              link_text: 'Send a magic link email',
            },
          },
        }}
      />
    </div>

    <!-- Footer Info -->
    <p class="text-center text-xs text-neutral-600 dark:text-neutral-500">
      By continuing, you agree to our Terms of Service and Privacy Policy
    </p>
  </div>
</div>

<style>
  /* Style the Supabase Auth UI container */
  .supabase-auth-container {
    min-height: 300px;
    width: 100%;
  }

  /* Override Supabase Auth UI styles to match House of Voi theme */
  :global(.supabase-auth-container [data-supabase-auth-ui]) {
    width: 100%;
  }

  :global(.supabase-auth-container button[type="submit"]) {
    background: linear-gradient(135deg, #f59e0b, #d97706) !important;
    font-weight: 700 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.05em !important;
  }

  :global(.supabase-auth-container button[type="submit"]:hover) {
    background: linear-gradient(135deg, #d97706, #b45309) !important;
  }

  :global(.supabase-auth-container a) {
    color: #f59e0b !important;
  }

  :global(.supabase-auth-container a:hover) {
    color: #d97706 !important;
  }

  /* Dark mode input styling */
  :global(.dark .supabase-auth-container input) {
    background-color: #171717 !important;
    color: #fff !important;
  }

  :global(.supabase-auth-container input::placeholder) {
    color: #737373 !important;
  }
</style>
