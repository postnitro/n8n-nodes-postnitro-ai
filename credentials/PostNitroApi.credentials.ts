import {
	IAuthenticateGeneric,
	ICredentialType,
	INodeProperties,
	ICredentialTestRequest
} from 'n8n-workflow';

export class PostNitroApi implements ICredentialType {
	name = 'postNitroApi';
	displayName = 'PostNitro Embed API';
	documentationUrl = 'https://postnitro.ai/docs/embed/api';
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description: 'API key to use in the embed-api-key header',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'embed-api-key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://embed-api.postnitro.ai',
			url: '/',
			method: 'GET',
			headers: {
				'embed-api-key': '={{$credentials.apiKey}}',
			},
		},
	};
}


