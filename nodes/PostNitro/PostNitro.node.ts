import type { IExecuteFunctions, INodeExecutionData, INodeProperties, IDataObject, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { postNitroRequest, waitForCompletion, OutputResult, StartResult, StatusResult, AiSource, PostType } from './GenericFunctions';

export class PostNitro implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'PostNitro',
		name: 'postNitro',
		icon: 'file:postnitro.svg',
		group: ['transform'],
		version: 1,
		description: 'Interact with PostNitro Embed API',
		defaults: {
			name: 'PostNitro',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'postNitroApi',
				required: true,
			},
		],
		properties: [
			// Resource (future-proof if multiple resources later)
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				options: [
					{
						name: 'Embed Post',
						value: 'embedPost',
					},
				],
				default: 'embedPost',
			},

			// Operation
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Generate Carousel from Text (AI)',
						value: 'aiFromText',
						action: 'Generate carousel using AI from plain text',
					},
					{
						name: 'Generate Carousel from an Article URL (AI)',
						value: 'aiFromArticle',
						action: 'Generate carousel using AI from an Article URL',
					},
					{
						name: 'Generate Carousel from an X (Twitter) Post (AI)',
						value: 'aiFromXPost',
						action: 'Generate carousel using AI from an X (Twitter) post URL',
					},
					{
						name: 'Import Carousel Slides',
						value: 'importSlides',
						action: 'Create carousel by Importing a predefined set of slides content',
					},
				],
				default: 'aiFromText',
			},

			// Post Type (future-proof)
			{
				displayName: 'Post Type',
				name: 'postType',
				type: 'options',
				options: [
					{ name: 'Carousel', value: 'CAROUSEL' },
					// { name: 'Image', value: 'IMAGE' },
					// { name: 'Video', value: 'VIDEO' },
				],
				default: 'CAROUSEL',
				description: 'Type of post to generate',
			},

			// Common fields
			{
				displayName: 'Template ID',
				name: 'templateId',
				type: 'string',
				default: '',
				required: true,
			},
			{
				displayName: 'Brand ID',
				name: 'brandId',
				type: 'string',
				default: '',
				required: true,
			},
			{
				displayName: 'Preset ID',
				name: 'presetId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['aiFromText', 'aiFromArticle', 'aiFromXPost'],
					},
				},
			},
			{
				displayName: 'Requestor ID',
				name: 'requestorId',
				type: 'string',
				default: '',
				description: 'Optional identifier of the end user',
			},
			{
				displayName: 'Response Type',
				name: 'responseType',
				type: 'options',
				options: [
					{ name: 'PDF', value: 'PDF' },
					{ name: 'PNG', value: 'PNG' },
					// Future: per post type variants could be shown dynamically
				],
				default: 'PDF',
			},

			// AI input fields per operation
			{
				displayName: 'Text',
				name: 'text',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				required: true,
				displayOptions: {
					show: { operation: ['aiFromText'] },
				},
			},
			{
				displayName: 'Article URL',
				name: 'articleUrl',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: { operation: ['aiFromArticle'] },
				},
			},
			{
				displayName: 'X (Twitter) Post URL',
				name: 'xUrl',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: { operation: ['aiFromXPost'] },
				},
			},
			{
				displayName: 'Additional Instructions',
				name: 'instructions',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				displayOptions: {
					show: { operation: ['aiFromText', 'aiFromArticle', 'aiFromXPost'] },
				},
			},

			// Import slides JSON
			{
				displayName: 'Slides (JSON)',
				name: 'slidesJson',
				type: 'string',
				typeOptions: { rows: 6 },
				default: '',
				description:
					'Array of slides. Must include exactly one starting_slide, at least one body_slide, and exactly one ending_slide.',
				displayOptions: {
					show: { operation: ['importSlides'] },
				},
			},

			// Options
			{
				displayName: 'Wait for Completion',
				name: 'waitForCompletion',
				type: 'boolean',
				default: true,
				description: 'Poll status until completed or failed',
			},
			{
				displayName: 'Poll Interval (seconds)',
				name: 'pollInterval',
				type: 'number',
				typeOptions: { minValue: 2 },
				default: 10,
				displayOptions: { show: { waitForCompletion: [true] } },
			},
			{
				displayName: 'Max Checks',
				name: 'maxChecks',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 60,
				displayOptions: { show: { waitForCompletion: [true] } },
			},
			{
				displayName: 'On Complete',
				name: 'onComplete',
				type: 'options',
				options: [
					{ name: 'Return Status Only', value: 'status' },
					{ name: 'Fetch Output', value: 'output' },
				],
				default: 'output',
				displayOptions: { show: { waitForCompletion: [true] } },
			},
			{
				displayName: 'Download Output as Binary',
				name: 'download',
				type: 'boolean',
				default: false,
				displayOptions: { show: { onComplete: ['output'], waitForCompletion: [true] } },
			},
			{
				displayName: 'Binary Property',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				displayOptions: { show: { download: [true], onComplete: ['output'], waitForCompletion: [true] } },
			},
		] as INodeProperties[],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as 'aiFromText' | 'aiFromArticle' | 'aiFromXPost' | 'importSlides';
				const postType = this.getNodeParameter('postType', i) as PostType;
				const templateId = this.getNodeParameter('templateId', i) as string;
				const brandId = this.getNodeParameter('brandId', i) as string;
				const responseType = this.getNodeParameter('responseType', i) as string;
				const requestorId = this.getNodeParameter('requestorId', i, '') as string;

				let startResp: StartResult | undefined;
				let aiSource: AiSource | undefined;

				if (operation === 'aiFromText' || operation === 'aiFromArticle' || operation === 'aiFromXPost') {
					const presetId = this.getNodeParameter('presetId', i) as string;
					const instructions = this.getNodeParameter('instructions', i, '') as string;

					if (operation === 'aiFromText') {
						aiSource = 'text';
					} else if (operation === 'aiFromArticle') {
						aiSource = 'article';
					} else {
						aiSource = 'x';
					}

					const contextValue =
						operation === 'aiFromText'
							? (this.getNodeParameter('text', i) as string)
							: operation === 'aiFromArticle'
								? (this.getNodeParameter('articleUrl', i) as string)
								: (this.getNodeParameter('xUrl', i) as string);

					const body: IDataObject = {
						postType,
						requestorId: requestorId || undefined,
						templateId,
						brandId,
						presetId,
						responseType,
						aiGeneration: {
							type: aiSource,
							context: contextValue,
							instructions: instructions || undefined,
						},
					};

					startResp = (await postNitroRequest.call(this, {
						method: 'POST',
						path: '/post/initiate/generate',
						body,
					})) as StartResult;
				} else if (operation === 'importSlides') {
					const slidesJson = this.getNodeParameter('slidesJson', i) as string;
					let slides: unknown;
					try {
						slides = JSON.parse(slidesJson);
						if (!Array.isArray(slides)) throw new Error('Slides JSON must be an array');
					} catch (e: any) {
						throw new NodeOperationError(this.getNode(), `Invalid slides JSON: ${e.message}`);
					}

					startResp = (await postNitroRequest.call(this, {
						method: 'POST',
						path: '/post/initiate/import',
						body: {
							postType,
							requestorId: requestorId || undefined,
							templateId,
							brandId,
							responseType,
							slides: slides as IDataObject[],
						},
					})) as StartResult;
				}

				if (!startResp?.success) {
					throw new NodeOperationError(this.getNode(), 'Failed to initiate post');
				}

				const embedPostId = (startResp as any).data.embedPostId as string;

				const shouldWaitForCompletion = this.getNodeParameter('waitForCompletion', i) as boolean;
				if (!shouldWaitForCompletion) {
					returnData.push({ json: startResp as unknown as IDataObject });
					continue;
				}

				const pollInterval = this.getNodeParameter('pollInterval', i) as number;
				const maxChecks = this.getNodeParameter('maxChecks', i) as number;
				const onComplete = this.getNodeParameter('onComplete', i) as 'status' | 'output';

				const statusResp = await waitForCompletion.call(this, embedPostId, pollInterval, maxChecks);
				const status = statusResp?.data?.embedPost?.status;

				if (status === 'FAILED') {
					const lastLog = (statusResp.data.logs || []).slice(-1)[0];
					throw new NodeOperationError(this.getNode(), `Generation failed${lastLog?.message ? `: ${lastLog.message}` : ''}`);
				}

				if (onComplete === 'status') {
					returnData.push({ json: statusResp as unknown as IDataObject });
					continue;
				}

				// Fetch output
				const outputResp = (await postNitroRequest.call(this, {
					method: 'GET',
					path: `/post/output/${embedPostId}`,
				})) as OutputResult;

				const download = this.getNodeParameter('download', i, false) as boolean;
				if (!download) {
					returnData.push({ json: outputResp as unknown as IDataObject });
					continue;
				}

				// Prepare binary
				const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
				const { result, embedPost } = outputResp.data as any;
				const mimeType = result.mimeType as string;
				const extension = mimeType.split('/')[1] || 'bin';
				const baseFileName = result.name || 'post';

				const toBufferFromUrl = async (url: string): Promise<Buffer> => {
					// Fetch directly from absolute URL (e.g., CDN/S3). Ensure binary buffer.
					const resp = await this.helpers.request({
						method: 'GET',
						url,
						json: false,
						encoding: null,
					});
					if (Buffer.isBuffer(resp)) return resp as Buffer;
					return Buffer.from(resp);
				};

				const resultData = result.data as string | string[];
				if (Array.isArray(resultData)) {
					// Multiple files (e.g., PNG pages). Attach as multiple binary properties.
					const binary: Record<string, any> = {};
					let index = 1;
					for (const urlOrString of resultData) {
						let buffer: Buffer;
						if (typeof urlOrString === 'string' && /^https?:\/\//.test(urlOrString)) {
							buffer = await toBufferFromUrl(urlOrString);
						} else if (typeof urlOrString === 'string' && /^(?:[A-Za-z0-9+/]+={0,2})$/.test(urlOrString)) {
							buffer = Buffer.from(urlOrString, 'base64');
						} else {
							throw new NodeOperationError(this.getNode(), 'Unsupported result item format');
						}
						const fileName = `${baseFileName}-${index}.${extension}`;
						const bin = await this.helpers.prepareBinaryData(buffer);
						bin.fileName = fileName;
						bin.mimeType = mimeType;
						binary[`${binaryPropertyName}${index}`] = bin;
						index += 1;
					}
					returnData.push({
						json: { embedPost, result: { ...result, data: resultData } },
						binary,
					});
				} else {
					// Single file (PDF or single image)
					let buffer: Buffer;
					if (typeof resultData === 'string' && /^https?:\/\//.test(resultData)) {
						buffer = await toBufferFromUrl(resultData);
					} else if (typeof resultData === 'string' && /^(?:[A-Za-z0-9+/]+={0,2})$/.test(resultData)) {
						buffer = Buffer.from(resultData, 'base64');
					} else {
						throw new NodeOperationError(this.getNode(), 'Unsupported result format');
					}
					const fileName = `${baseFileName}.${extension}`;
					const binaryData = await this.helpers.prepareBinaryData(buffer);
					binaryData.fileName = fileName;
					binaryData.mimeType = mimeType;
					returnData.push({
						json: { embedPost, result: { ...result, data: resultData } },
						binary: { [binaryPropertyName]: binaryData },
					});
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message } });
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}


