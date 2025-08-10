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
			displayName: 'API Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://embed-api.postnitro.ai',
			description: 'Base URL of the PostNitro Embed API',
		},
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
			baseURL: '={{$credentials.baseUrl}}',
			url: '/',
			method: 'GET',
			headers: {
				'embed-api-key': '={{$credentials.apiKey}}',
			},
		},
	};
}


