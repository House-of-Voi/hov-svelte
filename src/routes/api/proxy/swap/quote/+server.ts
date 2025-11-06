import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { publicEnv } from '$lib/utils/publicEnv';

/**
 * POST /api/proxy/swap/quote
 *
 * Proxy endpoint for the external Swap API to handle CORS issues.
 * Forwards requests to the Swap API at PUBLIC_SWAP_API_URL.
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({}));
		
		const apiUrl = publicEnv.SWAP_API_URL;
		const response = await fetch(`${apiUrl}/quote`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(body)
		});

		const data = await response.json();

		if (!response.ok) {
			return json(
				{ error: data.error || data.message || 'Failed to get quote' },
				{ status: response.status }
			);
		}

		return json(data);
	} catch (error) {
		console.error('Proxy error:', error);
		return json(
			{
				error: 'Failed to proxy request to Swap API',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};

