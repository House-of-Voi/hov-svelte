/**
 * ESM compatibility shim for @agoralabs-sh/avm-web-provider.
 *
 * The upstream package only exposes its full surface area via the CommonJS
 * default export. When avm-wallet-svelte tries to destructure named exports
 * through `import()`, it receives `undefined` and fails to initialise Kibisis.
 * This shim resolves the actual export object and re-exports everything so
 * consumers can safely import named symbols.
 */
import * as namespaceModule from '@agoralabs-sh/avm-web-provider/dist/index.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

function resolveExports(mod: AnyRecord | undefined): AnyRecord {
	if (!mod) return {};

	// The real exports include AVMWebClient/AVMWebProvider.
	if ('AVMWebClient' in mod || 'AVMWebProvider' in mod) {
		return mod;
	}

	// Some bundlers wrap the CJS export inside `.default`.
	if (mod.default && mod.default !== mod) {
		return resolveExports(mod.default as AnyRecord);
	}

	return mod;
}

const exportSource = resolveExports(namespaceModule);

if (!exportSource?.AVMWebClient) {
	console.error('[avm-web-provider shim] Failed to resolve AVMWebClient export', {
		availableKeys: Object.keys(exportSource || {})
	});
}

export const ARC0027_PREFIX = exportSource.ARC0027_PREFIX;
export const CHANNEL_NAME_SUFFIX = exportSource.CHANNEL_NAME_SUFFIX;
export const DEFAULT_REQUEST_TIMEOUT = exportSource.DEFAULT_REQUEST_TIMEOUT;
export const LOWER_REQUEST_TIMEOUT = exportSource.LOWER_REQUEST_TIMEOUT;
export const UPPER_REQUEST_TIMEOUT = exportSource.UPPER_REQUEST_TIMEOUT;
export const AVMWebClient = exportSource.AVMWebClient;
export const AVMWebProvider = exportSource.AVMWebProvider;
export const BaseController = exportSource.BaseController;
export const Logger = exportSource.Logger;
export const ARC0027ErrorCodeEnum = exportSource.ARC0027ErrorCodeEnum;
export const ARC0027MessageTypeEnum = exportSource.ARC0027MessageTypeEnum;
export const ARC0027MethodEnum = exportSource.ARC0027MethodEnum;
export const ARC0027FailedToPostSomeTransactionsError =
	exportSource.ARC0027FailedToPostSomeTransactionsError;
export const ARC0027InvalidGroupIdError = exportSource.ARC0027InvalidGroupIdError;
export const ARC0027InvalidInputError = exportSource.ARC0027InvalidInputError;
export const ARC0027MethodCanceledError = exportSource.ARC0027MethodCanceledError;
export const ARC0027MethodNotSupportedError = exportSource.ARC0027MethodNotSupportedError;
export const ARC0027MethodTimedOutError = exportSource.ARC0027MethodTimedOutError;
export const ARC0027NetworkNotSupportedError = exportSource.ARC0027NetworkNotSupportedError;
export const ARC0027UnauthorizedSignerError = exportSource.ARC0027UnauthorizedSignerError;
export const ARC0027UnknownError = exportSource.ARC0027UnknownError;
export const BaseARC0027Error = exportSource.BaseARC0027Error;
export const BaseResponseMessage = exportSource.BaseResponseMessage;
export const RequestMessage = exportSource.RequestMessage;
export const ResponseMessageWithError = exportSource.ResponseMessageWithError;
export const ResponseMessageWithResult = exportSource.ResponseMessageWithResult;
export const createMessageReference = exportSource.createMessageReference;

export default exportSource;
