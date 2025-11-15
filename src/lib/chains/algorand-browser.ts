import algosdk from 'algosdk';
import { PUBLIC_VOI_NODE_URL } from '$env/static/public';

const DEFAULT_ALGOD_URL = 'https://mainnet-api.voi.nodely.dev';
const algodClient = new algosdk.Algodv2('', PUBLIC_VOI_NODE_URL || DEFAULT_ALGOD_URL, '');

/**
 * Creates a self-payment transaction with a custom note that can be used as a
 * proof-of-ownership payload. The transaction is not meant to be broadcast—
 * it only exists so the user can sign it locally.
 */
export async function buildProofOfOwnershipTransaction(
  algorandAddress: string,
  challengeToken: string
): Promise<algosdk.Transaction> {
  const suggestedParams = await algodClient.getTransactionParams().do();

  return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: algorandAddress,
    receiver: algorandAddress,
    amount: 0,
    note: new TextEncoder().encode(challengeToken),
    suggestedParams,
  });
}
