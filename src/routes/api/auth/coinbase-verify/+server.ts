import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { createHash, randomUUID } from 'crypto';
import { createAdminClient } from '$lib/db/supabaseAdmin';
import { setSessionCookie, setKeyDerivationCookie } from '$lib/auth/cookies';
import { validateCdpToken } from '$lib/auth/cdp-validation';
import { validateReferralCode } from '$lib/referrals/validation';

const schema = z.object({
  accessToken: z.string().min(1, 'CDP access token is required'),
  cdpUserId: z.string().optional(),
  email: z.string().optional(),
  walletAddress: z.string().optional(),
  referralCode: z.string().min(7).max(7).optional(), // Optional - can be added later
});

/**
 * POST /api/auth/coinbase-verify
 *
 * Authenticates users via Coinbase CDP Embedded Wallets using CDP's server-side validation.
 *
 * NEW FLOW (CDP Token Validation):
 * 1. Receives CDP access token from client
 * 2. Validates token with CDP's backend to fetch the Base wallet and user identity
 * 3. Creates/updates the profile using contact data returned by CDP
 * 4. Stores the Base wallet address (authoritative source of truth)
 * 5. Issues a session tied to the CDP access token
 * 6. Returns whether an Algorand wallet has already been linked client-side
 *
 * SECURITY IMPROVEMENTS:
 * - No private keys transmitted over network
 * - Uses CDP's official token validation
 * - Backend no longer derives or observes Algorand private keys
 * - Backend never trusts client-supplied wallet data
 * - Token stored in HTTP-only cookie
 */
export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
  const data = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(data);

  if (!parsed.success) {
    return json(
      { error: 'Invalid payload', details: parsed.error.errors },
      { status: 400 }
    );
  }

  const {
    accessToken,
    cdpUserId: claimedCdpUserId,
    walletAddress: claimedWalletAddress,
    referralCode,
  } = parsed.data;

  try {
    if (!accessToken) {
      return json(
        { error: 'CDP access token missing. Please reauthenticate.' },
        { status: 400 }
      );
    }

    // Validate the CDP access token directly with Coinbase to fetch the authoritative user record
    const cdpUser = await validateCdpToken(accessToken);

    // If token is expired or invalid, return error
    if (!cdpUser) {
      return json(
        { error: 'Invalid or expired CDP access token. Please reauthenticate.' },
        { status: 401 }
      );
    }

    // Warn if the client-supplied identifiers don't match what CDP reports
    if (claimedCdpUserId && claimedCdpUserId !== cdpUser.userId) {
      console.warn(
        `CDP user mismatch: client=${claimedCdpUserId} backend=${cdpUser.userId}`
      );
    }

    if (
      claimedWalletAddress &&
      claimedWalletAddress.toLowerCase() !== cdpUser.walletAddress.toLowerCase()
    ) {
      console.warn(
        `Base wallet mismatch: client=${claimedWalletAddress} backend=${cdpUser.walletAddress}`
      );
    }

    const baseWalletAddress = cdpUser.walletAddress.toLowerCase();

    const supabase = createAdminClient();

    // Get the identity from CDP - email or phone
    const normalizedEmail =
      typeof cdpUser.email === 'string' && cdpUser.email.trim().length > 0
        ? cdpUser.email.trim().toLowerCase()
        : undefined;
    const normalizedPhone =
      typeof cdpUser.phoneNumber === 'string' && cdpUser.phoneNumber.trim().length > 0
        ? cdpUser.phoneNumber.trim()
        : undefined;

    const identity = normalizedEmail ?? normalizedPhone;

    if (!identity) {
      return json(
        { error: 'CDP did not return email or phone number. Cannot create profile.' },
        { status: 400 }
      );
    }

    // Look up existing profile by email or phone
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, primary_email')
      .eq('primary_email', identity)
      .maybeSingle();

    let finalProfile = profile;

    if (!profile) {
      // New profile - create it
      const { data: newProfile, error: profileError } = await supabase
        .from('profiles')
        .insert({
          primary_email: identity,
          game_access_granted: false,
          waitlist_joined_at: new Date().toISOString(),
        })
        .select('id, primary_email')
        .single();

      if (profileError || !newProfile) {
        console.error('Profile creation error:', profileError);
        return json(
          { error: `Failed to create profile: ${profileError?.message || 'Unknown error'}` },
          { status: 500 }
        );
      }

      finalProfile = newProfile;

      // If referral code provided, create referral relationship
      if (referralCode) {
        const referralValidation = await validateReferralCode(referralCode);
        if (
          referralValidation.valid &&
          referralValidation.referrerId &&
          referralValidation.codeId
        ) {
          const { data: canAccept } = await supabase.rpc('can_accept_referral', {
            p_profile_id: referralValidation.referrerId,
          });

          const isActive = canAccept === true;
          const now = new Date().toISOString();

          // Update the referral code to mark it as converted
          await supabase
            .from('referral_codes')
            .update({
              referred_profile_id: finalProfile.id,
              converted_at: now,
              attributed_at: now,
            })
            .eq('id', referralValidation.codeId);

          // Create the referral relationship
          await supabase.from('referrals').insert({
            referrer_profile_id: referralValidation.referrerId,
            referred_profile_id: finalProfile.id,
            referral_code_id: referralValidation.codeId,
            is_active: isActive,
            activated_at: isActive ? now : null,
          });
        }
      }
    }

    // Step 2: Profile created/updated - no need to store addresses in DB
    // Base and Voi addresses are now derived from CDP on-demand
    if (!finalProfile) {
      throw new Error('Failed to resolve profile during Coinbase verification');
    }

    // Note: We no longer store Base or derived Voi addresses in the accounts table.
    // Base address comes from CDP directly, Voi address is derived client-side and stored in session cookie.
    // The accounts table is now reserved for "connected" addresses (additional wallets linked by users).

    // Step 3: Create or update session with CDP user ID and access token
    const ttlSeconds = 60 * 60 * 24 * 7; // 7 days
    const sessionToken = accessToken;
    const tokenHash = createHash('sha256').update(sessionToken).digest('hex');
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    // Get client IP address
    const clientAddress = getClientAddress();
    const userAgent = request.headers.get('user-agent') ?? null;

    // Check if a session already exists for this CDP user ID
    const { data: existingSession } = await supabase
      .from('sessions')
      .select('id')
      .eq('cdp_user_id', cdpUser.userId)
      .eq('profile_id', finalProfile.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingSession) {
      // Update existing session with new token and expiration
      await supabase
        .from('sessions')
        .update({
          cdp_access_token_hash: tokenHash,
          expires_at: expiresAt,
          ip: clientAddress,
          user_agent: userAgent,
        })
        .eq('id', existingSession.id);
    } else {
      // Create new session
      const sessionId = randomUUID();
      await supabase.from('sessions').insert({
        id: sessionId,
        profile_id: finalProfile.id,
        cdp_user_id: cdpUser.userId,
        cdp_access_token_hash: tokenHash,
        jwt_id: null, // No longer using custom JWTs
        expires_at: expiresAt,
        ip: clientAddress,
        user_agent: userAgent,
      });
    }

    // Step 4: Set session token in cookie (this will be the CDP access token)
    setSessionCookie(cookies, sessionToken, ttlSeconds);

    // Step 5: Set key derivation cookie for client-side key encryption
    // This cookie contains a hash of the session token that can be read by JavaScript
    // to encrypt/decrypt stored private keys
    const derivationValue = createHash('sha256')
      .update(sessionToken)
      .update('house-of-voi-key-derivation') // Add domain-specific salt
      .digest('hex');
    setKeyDerivationCookie(cookies, derivationValue, ttlSeconds);

    return json({
      ok: true,
      profileId: finalProfile.id,
      cdpUserId: cdpUser.userId,
      baseWalletAddress,
      hasLinkedAlgorand: true, // Voi address is always derived from CDP, no linking required
      contact: {
        email: cdpUser.email ?? null,
        phoneNumber: cdpUser.phoneNumber ?? null,
        authMethod: cdpUser.authMethod,
      },
    });
  } catch (error) {
    console.error('Coinbase CDP verify error:', error);
    return json(
      {
        error: 'Authentication failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
};
