import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { dev } from '$app/environment';
import { createAdminClient } from '$lib/db/supabaseAdmin';
import {
	REF_COOKIE,
	REF_COOKIE_MAX_AGE,
	REF_FLASH_COOKIE,
	REF_FLASH_MAX_AGE,
	isValidReferralCodeFormat
} from '$lib/utils/referral';
import { validateReferralCode } from '$lib/referrals/validation';

type FlashPayload = { type: 'success' | 'error'; message: string };

export const load: PageServerLoad = async ({ params, cookies, locals, url }) => {
	const code = params.code?.toUpperCase() ?? '';
	const session = locals.session;
	const defaultRedirect = session?.profileId ? '/app' : '/auth';
	const redirectParam = url.searchParams.get('redirect');
	const redirectTarget =
		redirectParam && redirectParam.startsWith('/') ? redirectParam : defaultRedirect;

	const secure = !dev;

	const setFlash = (payload: FlashPayload) => {
		cookies.set(REF_FLASH_COOKIE, JSON.stringify(payload), {
			path: '/',
			maxAge: REF_FLASH_MAX_AGE,
			httpOnly: true,
			sameSite: 'lax',
			secure
		});
	};

	if (!code || !isValidReferralCodeFormat(code)) {
		setFlash({ type: 'error', message: 'Referral link is invalid or expired.' });
		throw redirect(303, redirectTarget);
	}

	const validation = await validateReferralCode(code);

	if (!validation.valid || !validation.referrerId || !validation.codeId) {
		setFlash({
			type: 'error',
			message: validation.error || 'Referral link is invalid or expired.'
		});
		throw redirect(303, redirectTarget);
	}

	// Store the referral code in a non-HTTP-only cookie so onboarding flows can access it
	cookies.set(REF_COOKIE, code, {
		path: '/',
		maxAge: REF_COOKIE_MAX_AGE,
		httpOnly: false,
		sameSite: 'lax',
		secure
	});

	const supabase = createAdminClient();
	const now = new Date().toISOString();

	// Mark the code as attributed if this is the first time it's been visited
	const { error: attributionError } = await supabase
		.from('referral_codes')
		.update({ attributed_at: now })
		.eq('id', validation.codeId)
		.is('attributed_at', null);

	if (attributionError) {
		console.error('Failed to mark referral attribution:', attributionError);
	}

	// If the user is not authenticated, just redirect after storing the cookie
	if (!session?.profileId) {
		throw redirect(303, redirectTarget);
	}

	if (validation.referrerId === session.profileId) {
		setFlash({
			type: 'error',
			message: 'You cannot use your own referral code.'
		});
		throw redirect(303, redirectTarget);
	}

	const { data: existingReferral, error: existingReferralError } = await supabase
		.from('referrals')
		.select('id')
		.eq('referred_profile_id', session.profileId)
		.maybeSingle();

	if (existingReferralError) {
		console.error('Failed to check existing referral:', existingReferralError);
		setFlash({ type: 'error', message: 'Failed to apply referral. Please try again.' });
		throw redirect(303, redirectTarget);
	}

	if (existingReferral) {
		setFlash({
			type: 'error',
			message: 'You already have a referral linked to your account.'
		});
		throw redirect(303, redirectTarget);
	}

	const { data: canAccept, error: canAcceptError } = await supabase.rpc('can_accept_referral', {
		p_profile_id: validation.referrerId
	});

	if (canAcceptError) {
		console.error('Failed to check referral capacity:', canAcceptError);
		setFlash({ type: 'error', message: 'Failed to apply referral. Please try again.' });
		throw redirect(303, redirectTarget);
	}

	const isActive = canAccept === true;

	const { data: currentCode, error: currentCodeError } = await supabase
		.from('referral_codes')
		.select('attributed_at')
		.eq('id', validation.codeId)
		.single();

	if (currentCodeError) {
		console.error('Failed to fetch referral code attribution:', currentCodeError);
	}

	const { data: updatedCode, error: updateError } = await supabase
		.from('referral_codes')
		.update({
			referred_profile_id: session.profileId,
			converted_at: now,
			attributed_at: currentCode?.attributed_at || now
		})
		.eq('id', validation.codeId)
		.is('referred_profile_id', null)
		.select('id');

	if (updateError || !updatedCode?.length) {
		if (updateError) {
			console.error('Failed to update referral code:', updateError);
		}

		setFlash({
			type: 'error',
			message: 'Failed to apply referral. Please try again or use a different code.'
		});
		throw redirect(303, redirectTarget);
	}

	const { error: insertError } = await supabase.from('referrals').insert({
		referrer_profile_id: validation.referrerId,
		referred_profile_id: session.profileId,
		referral_code_id: validation.codeId,
		is_active: isActive,
		activated_at: isActive ? now : null
	});

	if (insertError) {
		console.error('Failed to create referral relationship:', insertError);
		setFlash({
			type: 'error',
			message: 'Failed to apply referral. Please try again or contact support.'
		});
		throw redirect(303, redirectTarget);
	}

	setFlash({
		type: 'success',
		message: isActive
			? 'Referral code applied! Your account is now activated.'
			: "Referral code applied! You're in the queue until slots open."
	});

	throw redirect(303, redirectTarget);
};
