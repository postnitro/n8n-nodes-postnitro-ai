import {
	IDataObject,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IExecuteFunctions,
	JsonObject,
	NodeApiError,
	sleep,
} from 'n8n-workflow';

export const POSTNITRO_BASE_URL = 'https://embed-api.postnitro.ai';

export interface PostNitroRequestOptions {
	method: 'GET' | 'POST' | 'PUT';
	path: string;
	body?: IDataObject;
	qs?: IDataObject;
}

export async function postNitroRequest(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	options: PostNitroRequestOptions,
) {
	const requestOptions: IHttpRequestOptions = {
		method: options.method,
		url: `${POSTNITRO_BASE_URL}${options.path}`,
		headers: {
			'Content-Type': 'application/json',
		},
		json: true,
	} as IHttpRequestOptions;

	if (options.body) {
		requestOptions.body = options.body;
	}

	if (options.qs) {
		requestOptions.qs = options.qs;
	}

	try {
		// httpRequestWithAuthentication injects the credential (the `embed-api-key`
		// header is applied by the credential's `authenticate` property) and gains
		// future n8n improvements like token refresh and audit logging.
		return await this.helpers.httpRequestWithAuthentication.call(this, 'postNitroApi', requestOptions);
	} catch (error) {
		// NodeApiError is the idiomatic class for HTTP/API failures: it preserves
		// the full response context in the n8n UI and, unlike the raw error,
		// serializes cleanly (no circular socket references).
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}

export type PostType = 'CAROUSEL' | 'IMAGE' | 'VIDEO';
export type AiSource = 'text' | 'article' | 'x';

export interface StartResult {
	success: boolean;
	message: string;
	data: { embedPostId: string; status: string };
}

export interface StatusResult {
	success: boolean;
	data: { embedPostId: string; embedPost: { status: string }; logs: any[] };
}

export interface OutputResult {
	success: boolean;
	data: {
		embedPost: { id: string; status: string; responseType: string };
		result: { id: string; name: string; size?: string; type: string; mimeType: string; data: string | string[] };
	};
}

export async function waitForCompletion(
	this: IExecuteFunctions,
	embedPostId: string,
	pollIntervalSeconds: number,
	maxChecks: number,
): Promise<StatusResult> {
	let checks = 0;

	while (checks < maxChecks) {
		const statusResp = (await postNitroRequest.call(this, {
			method: 'GET',
			path: `/post/status/${embedPostId}`,
		})) as StatusResult;

		const status = statusResp?.data?.embedPost?.status;

		if (status === 'COMPLETED' || status === 'FAILED') {
			return statusResp;
		}

		await sleep(pollIntervalSeconds * 1000);
		checks += 1;
	}

	// Return last status after timeout
	const statusResp = (await postNitroRequest.call(this, {
		method: 'GET',
		path: `/post/status/${embedPostId}`,
	})) as StatusResult;

	return statusResp;
}