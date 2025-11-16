import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getArc200TokenInfo } from '$lib/voi/arc200';

export const GET: RequestHandler = async ({ params, url, locals }) => {
	const contractId = Number(params.contractId);

	if (!Number.isFinite(contractId) || contractId <= 0) {
		return json({ success: false, error: 'Invalid ARC200 contract ID' }, { status: 400 });
	}

	const explicitAddress = url.searchParams.get('address');
	const sessionAddress = locals.session?.voiAddress ?? null;
	const address = explicitAddress || sessionAddress || undefined;

	try {
		const data = await getArc200TokenInfo(contractId, address);
		return json({ success: true, data });
	} catch (error) {
		console.error('Failed to fetch ARC200 token info:', error);
		return json({ success: false, error: 'Failed to fetch ARC200 token info' }, { status: 500 });
	}
};
