import { IDataObject, IHttpRequestOptions, ILoadOptionsFunctions, IExecuteFunctions, sleep } from 'n8n-workflow';

export interface PostNitroRequestOptions {
	method: 'GET' | 'POST';
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

	const baseUrl = (credentials as any).baseUrl as string;

	const requestOptions: IHttpRequestOptions = {
		method: options.method,
		url: `${baseUrl}${options.path}`,
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

	// @ts-ignore - n8n provides this.helpers.request
	return await this.helpers.request(requestOptions);
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


