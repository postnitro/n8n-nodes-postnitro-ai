declare module 'n8n-workflow' {
	export type IDataObject = Record<string, any>;
	export type IHttpRequestOptions = Record<string, any>;
	// Sleep utility provided by n8n to avoid using restricted globals like setTimeout
	export function sleep(ms: number): Promise<void>;
	export interface IExecuteFunctions {
		getInputData(): Array<{ json: IDataObject; binary?: any }>;
		getNodeParameter(name: string, itemIndex: number, defaultValue?: any): any;
		continueOnFail(): boolean;
		helpers: {
			request(options: IHttpRequestOptions): Promise<any>;
			prepareBinaryData(data: Buffer): Promise<any>;
		};
		getCredentials(name: string): Promise<IDataObject | undefined>;
		getNode(): any;
	}
	export interface ILoadOptionsFunctions {
		getCredentials(name: string): Promise<IDataObject | undefined>;
		helpers: { request(options: IHttpRequestOptions): Promise<any> };
	}
	export interface INodeExecutionData {
		json: IDataObject;
		binary?: Record<string, any>;
	}
	export interface INodeProperties extends Record<string, any> { }
	export interface INodeTypeDescription extends Record<string, any> { }
	export interface INodeType {
		description: INodeTypeDescription;
		execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]>;
	}
	export interface IAuthenticateGeneric {
		type: 'generic';
		properties: {
			headers?: IDataObject;
			qs?: IDataObject;
		};
	}
	export interface ICredentialType {
		name: string;
		displayName: string;
		documentationUrl?: string;
		properties: INodeProperties[];
		authenticate?: IAuthenticateGeneric;
	}

	// Minimal declaration to allow using `ICredentialTestRequest` type
	export interface ICredentialTestRequest {
		request: {
			baseURL?: string;
			url: string;
			method?: string;
			headers?: IDataObject;
			qs?: IDataObject;
			body?: IDataObject;
		};
	}
	export class NodeOperationError extends Error {
		constructor(node: any, message: string);
	}
}


