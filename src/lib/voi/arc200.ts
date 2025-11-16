import algosdk from 'algosdk';
import { CONTRACT } from 'ulujs';
import { PUBLIC_VOI_NODE_URL } from '$env/static/public';
import { APP_SPEC as YBTAppSpec } from './house/YieldBearingTokenClient';

const DEFAULT_NODE_URL = 'https://mainnet-api.voi.nodely.dev';

const ARC200_ABI = {
	name: 'ARC200 Token',
	desc: 'Generic ARC200 ABI subset used for metadata and balance lookups',
	methods: YBTAppSpec.contract.methods.filter((method) => method.name?.startsWith('arc200_')),
	events: [],
};

const algodClient = new algosdk.Algodv2('', PUBLIC_VOI_NODE_URL || DEFAULT_NODE_URL, '');
const textDecoder = new TextDecoder();

export interface Arc200TokenInfo {
	contractId: number;
	name: string;
	symbol: string;
	decimals: number;
	balance?: string;
}

function decodeByteValue(value: unknown): string {
	if (typeof value === 'string') {
		return value.replace(/\0+$/, '').trim();
	}

	if (value instanceof Uint8Array) {
		return textDecoder.decode(value).replace(/\0+$/, '').trim();
	}

	if (Array.isArray(value)) {
		return textDecoder
			.decode(Uint8Array.from(value as number[]))
			.replace(/\0+$/, '')
			.trim();
	}

	return '';
}

/**
 * Fetch ARC200 token metadata and optional balance using ulujs CONTRACT helper.
 */
export async function getArc200TokenInfo(contractId: number, address?: string | null): Promise<Arc200TokenInfo> {
	const readOnlyAccount = {
		addr: algosdk.getApplicationAddress(contractId).toString(),
		sk: new Uint8Array(0),
	};

	const ci = new CONTRACT(contractId, algodClient, undefined, ARC200_ABI, readOnlyAccount);

	const [nameResult, symbolResult, decimalsResult] = await Promise.all([
		ci.arc200_name(),
		ci.arc200_symbol(),
		ci.arc200_decimals(),
	]);

	const name = decodeByteValue(nameResult?.returnValue) || 'ARC200 Token';
	const symbol = decodeByteValue(symbolResult?.returnValue) || 'ARC200';
	const decimals = decimalsResult?.success ? Number(decimalsResult.returnValue || 6) : 6;

	let balanceString: string | undefined;
	if (address) {
		try {
			const balanceResult = await ci.arc200_balanceOf(address);
			if (balanceResult.success) {
				const value = balanceResult.returnValue ?? 0;
				balanceString = typeof value === 'bigint' ? value.toString() : BigInt(value || 0).toString();
			} else {
				balanceString = '0';
			}
		} catch (error: any) {
			// 404 indicates the account hasn't opted in yet - treat as zero balance
			if (error?.status === 404 || error?.response?.status === 404) {
				balanceString = '0';
			} else {
				throw error;
			}
		}
	}

	return {
		contractId,
		name,
		symbol,
		decimals,
		balance: balanceString,
	};
}
