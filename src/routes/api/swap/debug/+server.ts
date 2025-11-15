import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import algosdk from 'algosdk';
import { env } from '$lib/utils/env';

const SWAP_CONTRACT_ID = 395553;

/**
 * GET /api/swap/debug
 * 
 * Debug endpoint to inspect the swap contract and understand its structure
 * This helps us refine the Info() method implementation
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const nodeUrl = env.PUBLIC_VOI_NODE_URL || 'https://mainnet-api.voi.nodely.dev';
		const algodClient = new algosdk.Algodv2('', nodeUrl, '');

		const debugInfo: Record<string, unknown> = {
			contractId: SWAP_CONTRACT_ID,
			contractAddress: algosdk.getApplicationAddress(SWAP_CONTRACT_ID)
		};

		// 1. Get application info
		try {
			const appInfo = await algodClient.getApplicationByID(SWAP_CONTRACT_ID).do();
			debugInfo.appInfo = {
				id: appInfo.id,
				params: {
					creator: appInfo.params.creator,
					approvalProgram: {
						length: appInfo.params['approval-program']?.length || 0
					},
					clearStateProgram: {
						length: appInfo.params['clear-state-program']?.length || 0
					},
					globalState: appInfo.params.globalState?.map((state: any) => {
						// Decode state keys
						const keyBytes = new Uint8Array(Buffer.from(state.key, 'base64'));
						const key = new TextDecoder('utf-8', { fatal: false }).decode(keyBytes);
						
						return {
							key: key || state.key,
							value: state.value,
							valueType: state.value.type
						};
					}) || []
				}
			};
		} catch (error) {
			debugInfo.appInfoError = error instanceof Error ? error.message : String(error);
		}

		// 2. Try to simulate Info() calls with different method names
		const methodNames = ['Info', 'info', 'getInfo', 'get_info', 'pools', 'getPools'];
		const suggestedParams = await algodClient.getTransactionParams().do();

		debugInfo.methodTests = [];

		for (const methodName of methodNames) {
			try {
				const txn = algosdk.makeApplicationNoOpTxnFromObject({
					sender: algosdk.getApplicationAddress(SWAP_CONTRACT_ID),
					appIndex: SWAP_CONTRACT_ID,
					appArgs: [new Uint8Array(Buffer.from(methodName))],
					suggestedParams,
				});

				// Use the same pattern as contract-client.ts
				const encodedSimTxn = algosdk.encodeUnsignedSimulateTransaction(txn);
				const signedTxn = algosdk.SignedTransaction.fromEncodingData(
					algosdk.decodeObj(encodedSimTxn)
				);

				const request = new algosdk.modelsv2.SimulateRequest({
					txnGroups: [
						new algosdk.modelsv2.SimulateRequestTransactionGroup({
							txns: [signedTxn]
						})
					]
				});

				const simResult = await algodClient.simulateTransactions(request).do();
				const txnResult = simResult.txnGroups?.[0]?.txnResults?.[0]?.txnResult;

				if (txnResult) {
					debugInfo.methodTests.push({
						methodName,
						success: true,
						hasLogs: !!txnResult.logs && txnResult.logs.length > 0,
						logCount: txnResult.logs?.length || 0,
						logs: txnResult.logs?.map((log: any) => {
							if (typeof log === 'string') {
								return { type: 'string', value: log, length: log.length };
							}
							return { type: 'Uint8Array', length: log.length };
						}) || [],
						hasInnerTxns: !!txnResult.innerTxns && txnResult.innerTxns.length > 0,
						innerTxnCount: txnResult.innerTxns?.length || 0,
						appCallTrace: txnResult.appCallTrace || null,
						error: txnResult.appCallTrace?.find((trace: any) => trace.error) || null
					});
				} else {
					debugInfo.methodTests.push({
						methodName,
						success: false,
						error: 'No transaction result'
					});
				}
			} catch (error) {
				debugInfo.methodTests.push({
					methodName,
					success: false,
					error: error instanceof Error ? error.message : String(error)
				});
			}
		}

		// 3. Try reading from global state
		try {
			const appInfo = await algodClient.getApplicationByID(SWAP_CONTRACT_ID).do();
			const globalState = appInfo.params.globalState || [];
			
			debugInfo.globalState = globalState.map((state: any) => {
				const keyBytes = new Uint8Array(Buffer.from(state.key, 'base64'));
				const key = new TextDecoder('utf-8', { fatal: false }).decode(keyBytes);
				
				let value: any;
				if (state.value.type === 1) {
					// Bytes
					const valueBytes = new Uint8Array(Buffer.from(state.value.bytes, 'base64'));
					try {
						value = new TextDecoder('utf-8', { fatal: false }).decode(valueBytes);
					} catch {
						value = Array.from(valueBytes).map(b => b.toString(16).padStart(2, '0')).join('');
					}
				} else if (state.value.type === 2) {
					// Uint
					value = BigInt(state.value.uint);
				}
				
				return {
					key: key || Buffer.from(state.key, 'base64').toString('hex'),
					value,
					valueType: state.value.type === 1 ? 'bytes' : 'uint',
					raw: state.value
				};
			});
		} catch (error) {
			debugInfo.globalStateError = error instanceof Error ? error.message : String(error);
		}

		// 4. Try to get contract account info
		try {
			const contractAddress = algosdk.getApplicationAddress(SWAP_CONTRACT_ID);
			const accountInfo = await algodClient.accountInformation(contractAddress).do();
			debugInfo.contractAccount = {
				address: contractAddress,
				balance: accountInfo.amount,
				assets: accountInfo.assets?.map((asset: any) => ({
					assetId: asset.assetId.toString(),
					amount: asset.amount.toString()
				})) || []
			};
		} catch (error) {
			debugInfo.contractAccountError = error instanceof Error ? error.message : String(error);
		}

		// Convert BigInt values to strings for JSON serialization
		const serializedDebugInfo = JSON.parse(JSON.stringify(debugInfo, (key, value) => {
			if (typeof value === 'bigint') {
				return value.toString();
			}
			return value;
		}));

		return json({
			success: true,
			data: serializedDebugInfo
		});
	} catch (error) {
		console.error('Debug endpoint error:', error);
		return json(
			{
				success: false,
				error: 'Internal server error',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};

