import {
	IDataObject,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IExecuteFunctions,
	NodeOperationError,
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
	const credentials = await this.getCredentials('postNitroApi');

	if (!credentials) {
		throw new Error('Missing PostNitro API credentials');
	}

	const requestOptions: IHttpRequestOptions = {
		method: options.method,
		url: `${POSTNITRO_BASE_URL}${options.path}`,
		headers: {
			'Content-Type': 'application/json',
			'embed-api-key': (credentials as any).apiKey as string,
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
		return await this.helpers.httpRequest(requestOptions);
	} catch (error: any) {
		const responseBody = error?.response?.body ?? error?.response?.data;
		const apiMessage =
			(responseBody && typeof responseBody === 'object'
				? responseBody.message || responseBody.error
				: undefined) ||
			(typeof responseBody === 'string' ? responseBody : undefined) ||
			error?.message ||
			'request failed';
		const httpCode =
			error?.response?.statusCode ?? error?.response?.status ?? error?.httpCode ?? error?.statusCode;

		throw new NodeOperationError(
			this.getNode(),
			`PostNitro API request to ${options.method} ${options.path} failed${httpCode ? ` (HTTP ${httpCode})` : ''
			}: ${apiMessage}`,
		);
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