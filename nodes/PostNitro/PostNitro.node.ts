import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeProperties,
	IDataObject,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import {
	postNitroRequest,
	waitForCompletion,
	OutputResult,
	StartResult,
	AiSource,
	PostType,
} from './GenericFunctions';

const DOCS = 'https://postnitro.ai/docs/embed/api';

/** Build a "Learn more" help link for a field description, pointing at the PostNitro docs. */
const doc = (path: string, label = 'Learn more'): string =>
	`<a href="${DOCS}/${path}" target="_blank">${label}</a>`;

const EXPR =
	'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>';

/**
 * Build the request body for creating/updating a scheduled post from the node's
 * scheduling parameters. Used by the Scheduled Post create/update operations and
 * by the combined Generate/Import & Schedule helpers (which pass a `designId`
 * obtained from the generated post's output).
 */
function buildScheduleBody(ctx: IExecuteFunctions, i: number, designId?: string): IDataObject {
	const status = ctx.getNodeParameter('status', i) as string;
	const scheduledAt = ctx.getNodeParameter('scheduledAt', i) as string;
	const contentRaw = ctx.getNodeParameter('postContent', i, {}) as IDataObject;
	const selectedAccounts = ctx.getNodeParameter('selectedAccounts', i, []) as string[];
	const settings = ctx.getNodeParameter('platformSettings', i, {}) as IDataObject;

	const body: IDataObject = { status, scheduledAt, selectedAccounts };

	const resolvedDesignId = designId ?? (ctx.getNodeParameter('designId', i, '') as string);
	if (resolvedDesignId) body.designId = resolvedDesignId;

	const postContent: IDataObject = {};
	for (const key of ['common', 'linkedin', 'instagram', 'tiktok', 'facebook', 'threads']) {
		const value = contentRaw[key];
		if (typeof value === 'string' && value.trim() !== '') {
			postContent[key] = value;
		}
	}
	if (Object.keys(postContent).length > 0) {
		body.postContent = postContent;
	}

	const parseJsonField = (raw: unknown, label: string): IDataObject | undefined => {
		if (raw === undefined || raw === null || raw === '') return undefined;
		if (typeof raw === 'object') return raw as IDataObject;
		try {
			return JSON.parse(raw as string) as IDataObject;
		} catch (e: any) {
			throw new NodeOperationError(ctx.getNode(), `Invalid JSON in ${label}: ${e.message}`);
		}
	};
	for (const key of [
		'instagramPostSettings',
		'tiktokPostSettings',
		'linkedinPostSettings',
		'threadsPostSettings',
	]) {
		const parsed = parseJsonField(settings[key], key);
		if (parsed !== undefined) body[key] = parsed;
	}

	return body;
}

/**
 * Build the optional `generateImages` object for the initiate endpoints. Its
 * presence is the opt-in, so this returns undefined when the toggle is off. Only
 * `context`, `imagePlacement`, and `imageStrategy` are sent — everything else
 * (image model, copy config, editorType) is resolved server-side.
 */
function buildGenerateImages(ctx: IExecuteFunctions, i: number): IDataObject | undefined {
	const enabled = ctx.getNodeParameter('generateImages', i, false) as boolean;
	if (!enabled) return undefined;

	const cfg: IDataObject = {
		imagePlacement: ctx.getNodeParameter('imagePlacement', i, 'auto') as string,
		imageStrategy: ctx.getNodeParameter('imageStrategy', i, 'strategic') as string,
	};
	const context = ctx.getNodeParameter('imageContext', i, '') as string;
	if (context && context.trim() !== '') cfg.context = context;

	return cfg;
}

export class PostNitro implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'PostNitro',
		name: 'postNitro',
		icon: 'file:postnitro.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Turn ideas, articles, or posts into branded carousels and images — then schedule them straight to your social accounts',
		documentationUrl: 'https://postnitro.ai/docs/embed/api',
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
			// ----------------------------------------------------------------
			// Resource
			// ----------------------------------------------------------------
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Create Post',
						value: 'embedPost',
						description: 'Generate with AI or import your own content to create carousels and single images',
					},
					{
						name: 'Scheduled Post',
						value: 'scheduledPost',
						description: 'Plan, draft, update, and schedule social posts across LinkedIn, Instagram, TikTok, and Threads',
					},
					{
						name: 'Create & Schedule',
						value: 'combined',
						description: 'Multi-step helpers that create a post and schedule it in a single run',
					},
				],
				default: 'embedPost',
			},

			// ----------------------------------------------------------------
			// Operation — Create Post
			// ----------------------------------------------------------------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['embedPost'] } },
				options: [
					{
						name: 'Import Slides / Image Content',
						value: 'importSlides',
						action: 'Import your own slide or image content',
						description: 'Build a post from content you supply as JSON — an array of slides for a carousel, or a single object for an image',
					},
					{
						name: 'Generate from Text (AI)',
						value: 'aiFromText',
						action: 'Generate a post from a text topic with AI',
						description: 'Turn a plain-text topic or prompt into a fully branded carousel or image using AI',
					},
					{
						name: 'Generate from an Article URL (AI)',
						value: 'aiFromArticle',
						action: 'Generate a post from an article URL with AI',
						description: 'Summarize an article at a given URL into a branded carousel or image using AI',
					},
					{
						name: 'Generate from an X (Twitter) Post (AI)',
						value: 'aiFromXPost',
						action: 'Generate a post from an X post with AI',
						description: 'Turn an X (Twitter) post into a branded carousel or image using AI',
					},
				],
				default: 'aiFromText',
			},

			// ----------------------------------------------------------------
			// Operation — Create & Schedule
			// ----------------------------------------------------------------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['combined'] } },
				options: [
					{
						name: 'Generate & Schedule (AI)',
						value: 'generateAndSchedule',
						action: 'Generate a post with AI and schedule it',
						description: 'Generate a post with AI and schedule it (or save a draft) to your social accounts in one step',
					},
					{
						name: 'Import & Schedule',
						value: 'importAndSchedule',
						action: 'Import your own content and schedule it',
						description: 'Import content you supply and schedule it (or save a draft) to your social accounts in one step',
					},
				],
				default: 'generateAndSchedule',
			},

			// ----------------------------------------------------------------
			// Operation — Scheduled Post
			// ----------------------------------------------------------------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['scheduledPost'] } },
				options: [
					{
						name: 'Create',
						value: 'create',
						action: 'Create a scheduled post or draft',
						description: 'Schedule a new social post, or save it as a draft, for your connected accounts',
					},
					{
						name: 'Get Many',
						value: 'list',
						action: 'Get many scheduled posts',
						description: 'List scheduled posts and drafts whose scheduled time falls within a date range',
					},
					{
						name: 'Update',
						value: 'update',
						action: 'Update a scheduled post',
						description: 'Change the schedule, captions, accounts, or platform settings of an existing scheduled post',
					},
				],
				default: 'create',
			},

			// ================================================================
			// Create Post / Create & Schedule fields (generation + import)
			// ================================================================
			{
				displayName: 'Post Type',
				name: 'postType',
				type: 'options',
				options: [
					{ name: 'Carousel', value: 'CAROUSEL' },
					{ name: 'Image', value: 'IMAGE' },
				],
				default: 'CAROUSEL',
				description: `Type of post to generate. IMAGE produces a single image. Help doc: ${doc('initiate/import', 'Post types')}`,
				displayOptions: { show: { resource: ['embedPost', 'combined'] } },
			},
			{
				displayName: 'Template Name or ID',
				name: 'templateId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getTemplates' },
				default: '',
				required: true,
				description: `Template to use. ${EXPR}. Help doc: ${doc('templates', 'Templates API')}`,
				displayOptions: { show: { resource: ['embedPost', 'combined'] } },
			},
			{
				displayName: 'Brand Name or ID',
				name: 'brandId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getBrands' },
				default: '',
				required: true,
				description: `Brand to stamp on the post. ${EXPR}. Help doc: ${doc('brands', 'Brands API')}`,
				displayOptions: { show: { resource: ['embedPost', 'combined'] } },
			},
			{
				displayName: 'Preset Name or ID',
				name: 'presetId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getPresets' },
				default: '',
				required: true,
				description: `AI generation preset to use. ${EXPR}. Help doc: ${doc('ai-presets', 'AI Presets API')}`,
				displayOptions: {
					show: {
						resource: ['embedPost', 'combined'],
						operation: ['aiFromText', 'aiFromArticle', 'aiFromXPost', 'generateAndSchedule'],
					},
				},
			},
			{
				displayName: 'Requestor ID',
				name: 'requestorId',
				type: 'string',
				default: '',
				description: 'Optional identifier of the end user, echoed back for tracking',
				displayOptions: { show: { resource: ['embedPost', 'combined'] } },
			},
			{
				displayName: 'Response Type',
				name: 'responseType',
				type: 'options',
				options: [
					{ name: 'PDF', value: 'PDF', description: 'Single document URL' },
					{ name: 'PNG', value: 'PNG', description: 'One image URL per slide' },
					{
						name: 'Design',
						value: 'DESIGN',
						description: 'Skip rendering; return a designId you can pass to a Scheduled Post',
					},
				],
				default: 'PDF',
				description: `Output format. The Schedule helpers always use Design internally. Help doc: ${doc('initiate/generate#request-body', 'Response types & output')}`,
				displayOptions: {
					show: {
						resource: ['embedPost'],
						operation: ['aiFromText', 'aiFromArticle', 'aiFromXPost', 'importSlides'],
					},
				},
			},

			// AI input fields per operation
			{
				displayName: 'Text',
				name: 'text',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				required: true,
				description: `Topic or prompt describing what to create. Help doc: ${doc('initiate/generate#ai-generation-object', 'AI Generation API')}`,
				displayOptions: { show: { resource: ['embedPost'], operation: ['aiFromText'] } },
			},
			{
				displayName: 'Article URL',
				name: 'articleUrl',
				type: 'string',
				default: '',
				required: true,
				description: `URL of an article to turn into a post. Help doc: ${doc('initiate/generate#ai-generation-object', 'AI Generation API')}`,
				displayOptions: { show: { resource: ['embedPost'], operation: ['aiFromArticle'] } },
			},
			{
				displayName: 'X (Twitter) Post URL',
				name: 'xUrl',
				type: 'string',
				default: '',
				required: true,
				description: `URL of an X (Twitter) post to turn into a post. Help doc: ${doc('initiate/generate#ai-generation-object', 'AI Generation API')}`,
				displayOptions: { show: { resource: ['embedPost'], operation: ['aiFromXPost'] } },
			},
			{
				displayName: 'Source',
				name: 'aiSource',
				type: 'options',
				options: [
					{ name: 'Text / Topic', value: 'text' },
					{ name: 'Article URL', value: 'article' },
					{ name: 'X (Twitter) Post URL', value: 'x' },
				],
				default: 'text',
				description: 'What the AI generates from',
				displayOptions: { show: { resource: ['combined'], operation: ['generateAndSchedule'] } },
			},
			{
				displayName: 'Content',
				name: 'aiContext',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				required: true,
				description: `A plain-text topic/prompt, an article URL, or an X post URL — matching the chosen Source. Help doc: ${doc('initiate/generate#ai-generation-object', 'AI Generation API')}`,
				displayOptions: { show: { resource: ['combined'], operation: ['generateAndSchedule'] } },
			},
			{
				displayName: 'Additional Instructions',
				name: 'instructions',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				description: 'Optional extra guidance for the AI (e.g. focus, style, constraints)',
				displayOptions: {
					show: {
						resource: ['embedPost', 'combined'],
						operation: ['aiFromText', 'aiFromArticle', 'aiFromXPost', 'generateAndSchedule'],
					},
				},
			},

			// Import slides / image JSON
			{
				displayName: 'Slides / Image (JSON)',
				name: 'slidesJson',
				type: 'json',
				default: '',
				description: `For CAROUSEL: an array of slides (exactly one starting_slide, at least one body_slide, exactly one ending_slide). For IMAGE: a single slide object. Both support the infographic layoutType/layoutConfig fields. Help doc: ${doc('initiate/import#slide-structure', 'Import API & slide structure')}`,
				displayOptions: { show: { resource: ['embedPost', 'combined'], operation: ['importSlides', 'importAndSchedule'] } },
			},

			// AI image generation (optional, opt-in) — applies to both generate and import
			{
				displayName: 'Generate AI Images',
				name: 'generateImages',
				type: 'boolean',
				default: false,
				description: `Whether to have AI generate images and bake them into the post before rendering. Best-effort — the post still completes if images are skipped (e.g. Free plan or over the AI-image quota). Help doc: ${doc('initiate/generate#ai-image-generation', 'AI image generation')}`,
				displayOptions: { show: { resource: ['embedPost', 'combined'] } },
			},
			{
				displayName: 'Image Context',
				name: 'imageContext',
				type: 'string',
				typeOptions: { rows: 2 },
				default: '',
				description:
					'Optional brief that guides the image prompts. If empty, Generate reuses your AI context/preset and Import uses sensible defaults.',
				displayOptions: { show: { resource: ['embedPost', 'combined'], generateImages: [true] } },
			},
			{
				displayName: 'Image Placement',
				name: 'imagePlacement',
				type: 'options',
				options: [
					{ name: 'Auto (AI Decides)', value: 'auto' },
					{ name: 'Background', value: 'background' },
					{ name: 'In-Line', value: 'in-line' },
				],
				default: 'auto',
				description: 'Where generated images are placed on each slide',
				displayOptions: { show: { resource: ['embedPost', 'combined'], generateImages: [true] } },
			},
			{
				displayName: 'Image Strategy',
				name: 'imageStrategy',
				type: 'options',
				options: [
					{ name: 'Strategic (About Half the Slides)', value: 'strategic' },
					{ name: 'All Eligible Slides', value: 'all' },
				],
				default: 'strategic',
				description:
					'How many slides get an image. Strategic caps at roughly half for a balanced look; All images every eligible slide (subject to your AI-image quota).',
				displayOptions: { show: { resource: ['embedPost', 'combined'], generateImages: [true] } },
			},

			// Wait / output options
			{
				displayName: 'Wait for Completion',
				name: 'waitForCompletion',
				type: 'boolean',
				default: true,
				description: 'Whether to poll status until the post is completed or failed',
				displayOptions: {
					show: {
						resource: ['embedPost'],
						operation: ['aiFromText', 'aiFromArticle', 'aiFromXPost', 'importSlides'],
					},
				},
			},
			{
				displayName: 'Poll Interval (Seconds)',
				name: 'pollInterval',
				type: 'number',
				typeOptions: { minValue: 2 },
				default: 10,
				displayOptions: {
					show: {
						resource: ['embedPost'],
						operation: ['aiFromText', 'aiFromArticle', 'aiFromXPost', 'importSlides'],
						waitForCompletion: [true],
					},
				},
			},
			{
				displayName: 'Max Checks',
				name: 'maxChecks',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 60,
				displayOptions: {
					show: {
						resource: ['embedPost'],
						operation: ['aiFromText', 'aiFromArticle', 'aiFromXPost', 'importSlides'],
						waitForCompletion: [true],
					},
				},
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
				displayOptions: {
					show: {
						resource: ['embedPost'],
						operation: ['aiFromText', 'aiFromArticle', 'aiFromXPost', 'importSlides'],
						waitForCompletion: [true],
					},
				},
			},
			{
				displayName: 'Download Output as Binary',
				name: 'download',
				type: 'boolean',
				default: false,
				description: 'Whether to attach the generated file(s) as binary data. Not applicable to the Design response type.',
				displayOptions: {
					show: {
						resource: ['embedPost'],
						operation: ['aiFromText', 'aiFromArticle', 'aiFromXPost', 'importSlides'],
						onComplete: ['output'],
						waitForCompletion: [true],
						responseType: ['PDF', 'PNG'],
					},
				},
			},
			{
				displayName: 'Binary Property',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				displayOptions: {
					show: {
						resource: ['embedPost'],
						operation: ['aiFromText', 'aiFromArticle', 'aiFromXPost', 'importSlides'],
						download: [true],
						onComplete: ['output'],
						waitForCompletion: [true],
						responseType: ['PDF', 'PNG'],
					},
				},
			},

			// ================================================================
			// Scheduled Post fields
			// ================================================================
			{
				displayName: 'Scheduled Post ID',
				name: 'scheduledPostId',
				type: 'string',
				default: '',
				required: true,
				description: `ID of the scheduled post to update. Help doc: ${doc('schedule/update-scheduled-post', 'Schedule API')}`,
				displayOptions: {
					show: { resource: ['scheduledPost'], operation: ['update'] },
				},
			},
			{
				displayName: 'From Date',
				name: 'fromDate',
				type: 'dateTime',
				default: '',
				required: true,
				description: `Start of the range. Matches scheduledAt >= fromDate. Help doc: ${doc('schedule/list-scheduled-posts#query-parameters', 'List posts')}`,
				displayOptions: { show: { resource: ['scheduledPost'], operation: ['list'] } },
			},
			{
				displayName: 'To Date',
				name: 'toDate',
				type: 'dateTime',
				default: '',
				required: true,
				description: `End of the range. Matches scheduledAt <= toDate. Help doc: ${doc('schedule/list-scheduled-posts#query-parameters', 'List posts')}`,
				displayOptions: { show: { resource: ['scheduledPost'], operation: ['list'] } },
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: [
					{ name: 'Draft', value: 'DRAFT' },
					{ name: 'Scheduled', value: 'SCHEDULED' },
				],
				default: 'SCHEDULED',
				description: `Whether to save as a draft or schedule for publishing. Help doc: ${doc('schedule/create-scheduled-post#status', 'Create a scheduled post')}`,
				displayOptions: {
					show: {
						resource: ['scheduledPost', 'combined'],
						operation: ['create', 'update', 'generateAndSchedule', 'importAndSchedule'],
					},
				},
			},
			{
				displayName: 'Scheduled At',
				name: 'scheduledAt',
				type: 'dateTime',
				default: '',
				required: true,
				description: 'When the post should publish. Must be in the future (required for drafts too).',
				displayOptions: {
					show: {
						resource: ['scheduledPost', 'combined'],
						operation: ['create', 'update', 'generateAndSchedule', 'importAndSchedule'],
					},
				},
			},
			{
				displayName: 'Design ID',
				name: 'designId',
				type: 'string',
				default: '',
				description: `Design to attach, e.g. the designId returned by a Create Post output. A post must have either a Design ID or a caption in Post Content. Help doc: ${doc('schedule/create-scheduled-post#designid', 'Create a scheduled post')}`,
				displayOptions: { show: { resource: ['scheduledPost'], operation: ['create', 'update'] } },
			},
			{
				displayName: 'Post Content (Captions)',
				name: 'postContent',
				type: 'collection',
				placeholder: 'Add Caption',
				default: {},
				description: `Caption text per platform. At least one caption (or a Design ID) is required. Help doc: ${doc('schedule/create-scheduled-post#postcontent', 'Captions & request body')}`,
				displayOptions: {
					show: {
						resource: ['scheduledPost', 'combined'],
						operation: ['create', 'update', 'generateAndSchedule', 'importAndSchedule'],
					},
				},
				options: [
					{ displayName: 'Common (Fallback)', name: 'common', type: 'string', typeOptions: { rows: 3 }, default: '' },
					{ displayName: 'LinkedIn', name: 'linkedin', type: 'string', typeOptions: { rows: 3 }, default: '' },
					{ displayName: 'Instagram', name: 'instagram', type: 'string', typeOptions: { rows: 3 }, default: '' },
					{ displayName: 'TikTok', name: 'tiktok', type: 'string', typeOptions: { rows: 3 }, default: '' },
					{ displayName: 'Facebook', name: 'facebook', type: 'string', typeOptions: { rows: 3 }, default: '' },
					{ displayName: 'Threads', name: 'threads', type: 'string', typeOptions: { rows: 3 }, default: '' },
				],
			},
			{
				displayName: 'Selected Account Names or IDs',
				name: 'selectedAccounts',
				type: 'multiOptions',
				typeOptions: { loadOptionsMethod: 'getSocialAccounts' },
				default: [],
				description: `Social accounts to publish to. Choose from the list, or specify IDs using an expression. The chosen platforms determine which platform settings are required. Help doc: ${doc('social-accounts', 'Social Accounts API')}`,
				displayOptions: {
					show: {
						resource: ['scheduledPost', 'combined'],
						operation: ['create', 'update', 'generateAndSchedule', 'importAndSchedule'],
					},
				},
			},
			{
				displayName: 'Platform Settings',
				name: 'platformSettings',
				type: 'collection',
				placeholder: 'Add Platform Settings',
				default: {},
				description: `Per-platform settings as JSON. Conditionally required depending on the selected accounts and whether a Design ID is set. Help doc: ${doc('schedule/platform-settings', 'Platform settings & rules')}`,
				displayOptions: {
					show: {
						resource: ['scheduledPost', 'combined'],
						operation: ['create', 'update', 'generateAndSchedule', 'importAndSchedule'],
					},
				},
				options: [
					{
						displayName: 'LinkedIn Post Settings (JSON)',
						name: 'linkedinPostSettings',
						type: 'json',
						default: '{\n  "postType": "document",\n  "postTitle": null\n}',
					},
					{
						displayName: 'Instagram Post Settings (JSON)',
						name: 'instagramPostSettings',
						type: 'json',
						default: '{\n  "postType": "carousel",\n  "postAsStory": false\n}',
					},
					{
						displayName: 'TikTok Post Settings (JSON)',
						name: 'tiktokPostSettings',
						type: 'json',
						default:
							'{\n  "postType": "carousel",\n  "privacyLevel": "PUBLIC_TO_EVERYONE",\n  "canComment": true,\n  "autoAddMusic": true,\n  "isBrandedContent": false,\n  "isYourBrand": false,\n  "isThirdPartyBrand": false,\n  "isAIGeneratedContent": false\n}',
					},
					{
						displayName: 'Threads Post Settings (JSON)',
						name: 'threadsPostSettings',
						type: 'json',
						default: '{\n  "postType": "carousel"\n}',
					},
				],
			},
		] as INodeProperties[],
	};

	methods = {
		loadOptions: {
			async getTemplates(this: ILoadOptionsFunctions) {
				const resp = (await postNitroRequest.call(this, {
					method: 'GET',
					path: '/template',
					qs: { limit: 100 },
				})) as IDataObject;
				const templates = (((resp?.data as IDataObject)?.templates as IDataObject[]) || []);
				return templates.map((t) => {
					const size = t.size as any;
					const sizeLabel =
						size && typeof size === 'object' ? (size.id ?? size.aspectRatio ?? '') : size;
					return {
						name: sizeLabel ? `${t.name} (${sizeLabel})` : (t.name as string),
						value: t.id as string,
					};
				});
			},

			async getBrands(this: ILoadOptionsFunctions) {
				const resp = (await postNitroRequest.call(this, {
					method: 'GET',
					path: '/brand',
					qs: { limit: 100 },
				})) as IDataObject;
				const brands = (((resp?.data as IDataObject)?.brands as IDataObject[]) || []);
				return brands.map((b) => ({
					name: b.handle ? `${b.name} (${b.handle})` : (b.name as string),
					value: b.id as string,
				}));
			},

			async getPresets(this: ILoadOptionsFunctions) {
				const resp = (await postNitroRequest.call(this, {
					method: 'GET',
					path: '/ai-preset',
					qs: { limit: 100 },
				})) as IDataObject;
				const presets = (((resp?.data as IDataObject)?.presets as IDataObject[]) || []);
				return presets.map((p) => {
					const parts = [p.socialPlatform, p.tone, p.audience].filter(Boolean).join(' · ');
					const slides = p.slides ? ` — ${p.slides} slides` : '';
					const label = `${parts}${slides}`.trim();
					return {
						name: label !== '' ? label : (p.id as string),
						value: p.id as string,
					};
				});
			},

			async getSocialAccounts(this: ILoadOptionsFunctions) {
				const resp = (await postNitroRequest.call(this, {
					method: 'GET',
					path: '/social-account',
				})) as IDataObject;
				const groups = ((resp?.data as IDataObject)?.socialAccounts as IDataObject) || {};
				const options: Array<{ name: string; value: string }> = [];
				for (const platform of Object.keys(groups)) {
					const accounts = (groups[platform] as IDataObject[]) || [];
					for (const acct of accounts) {
						const label = (acct.accountName || acct.accountHandle || acct.id) as string;
						options.push({ name: `${label} (${platform})`, value: acct.id as string });
					}
				}
				return options;
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;

				// ==========================================================
				// Scheduled Post
				// ==========================================================
				if (resource === 'scheduledPost') {
					if (operation === 'create' || operation === 'update') {
						const body = buildScheduleBody(this, i);

						let resp: IDataObject;
						if (operation === 'create') {
							resp = (await postNitroRequest.call(this, {
								method: 'POST',
								path: '/schedule',
								body,
							})) as IDataObject;
						} else {
							const scheduledPostId = this.getNodeParameter('scheduledPostId', i) as string;
							resp = (await postNitroRequest.call(this, {
								method: 'PUT',
								path: `/schedule/${scheduledPostId}`,
								body,
							})) as IDataObject;
						}

						returnData.push({
							json: (resp.data as IDataObject) ?? resp,
							pairedItem: { item: i },
						});
						continue;
					}

					if (operation === 'list') {
						const fromDate = this.getNodeParameter('fromDate', i) as string;
						const toDate = this.getNodeParameter('toDate', i) as string;
						const resp = (await postNitroRequest.call(this, {
							method: 'GET',
							path: '/schedule',
							qs: { fromDate, toDate },
						})) as IDataObject;
						const posts = (resp.data as IDataObject[]) || [];
						for (const post of posts) {
							returnData.push({ json: post, pairedItem: { item: i } });
						}
						continue;
					}
				}

				// ==========================================================
				// Create Post + Create & Schedule (generate/import, then
				// optionally schedule the resulting design)
				// ==========================================================
				const postType = this.getNodeParameter('postType', i) as PostType;
				const templateId = this.getNodeParameter('templateId', i) as string;
				const brandId = this.getNodeParameter('brandId', i) as string;
				const requestorId = this.getNodeParameter('requestorId', i, '') as string;

				const isSchedule = operation === 'generateAndSchedule' || operation === 'importAndSchedule';
				const isAiGenerate =
					operation === 'aiFromText' ||
					operation === 'aiFromArticle' ||
					operation === 'aiFromXPost' ||
					operation === 'generateAndSchedule';
				const isImport = operation === 'importSlides' || operation === 'importAndSchedule';

				// The Schedule helpers only need a design, so they always use DESIGN (no rendering).
				const responseType = isSchedule
					? 'DESIGN'
					: (this.getNodeParameter('responseType', i) as string);

				// Optional AI image generation (opt-in), shared by generate and import.
				const generateImagesCfg = buildGenerateImages(this, i);

				let startResp: StartResult | undefined;
				let aiSource: AiSource | undefined;

				if (isAiGenerate) {
					const presetId = this.getNodeParameter('presetId', i) as string;
					const instructions = this.getNodeParameter('instructions', i, '') as string;

					let contextValue: string;
					if (operation === 'generateAndSchedule') {
						aiSource = this.getNodeParameter('aiSource', i) as AiSource;
						contextValue = this.getNodeParameter('aiContext', i) as string;
					} else {
						if (operation === 'aiFromText') {
							aiSource = 'text';
						} else if (operation === 'aiFromArticle') {
							aiSource = 'article';
						} else {
							aiSource = 'x';
						}
						contextValue =
							operation === 'aiFromText'
								? (this.getNodeParameter('text', i) as string)
								: operation === 'aiFromArticle'
									? (this.getNodeParameter('articleUrl', i) as string)
									: (this.getNodeParameter('xUrl', i) as string);
					}

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

					if (generateImagesCfg) body.generateImages = generateImagesCfg;

					startResp = (await postNitroRequest.call(this, {
						method: 'POST',
						path: '/post/initiate/generate',
						body,
					})) as StartResult;
				} else if (isImport) {
					const slidesJson = this.getNodeParameter('slidesJson', i) as string;
					let slides: unknown;
					try {
						slides = typeof slidesJson === 'string' ? JSON.parse(slidesJson) : slidesJson;
					} catch (e: any) {
						throw new NodeOperationError(this.getNode(), `Invalid slides JSON: ${e.message}`);
					}

					if (postType === 'IMAGE') {
						if (Array.isArray(slides) || typeof slides !== 'object' || slides === null) {
							throw new NodeOperationError(
								this.getNode(),
								'For an IMAGE post, Slides / Image must be a single JSON object',
							);
						}
					} else if (!Array.isArray(slides)) {
						throw new NodeOperationError(
							this.getNode(),
							'For a CAROUSEL post, Slides / Image must be a JSON array',
						);
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
							slides: slides as IDataObject | IDataObject[],
							...(generateImagesCfg ? { generateImages: generateImagesCfg } : {}),
						},
					})) as StartResult;
				}

				if (!startResp?.success) {
					throw new NodeOperationError(this.getNode(), 'Failed to initiate post');
				}

				const embedPostId = (startResp as any).data.embedPostId as string;

				// Combined helpers: wait for the design, then create the scheduled post from it.
				if (isSchedule) {
					const statusResp = await waitForCompletion.call(this, embedPostId, 5, 60);
					const genStatus = statusResp?.data?.embedPost?.status;
					if (genStatus === 'FAILED') {
						const lastLog = (statusResp.data.logs || []).slice(-1)[0];
						throw new NodeOperationError(
							this.getNode(),
							`Generation failed${lastLog?.message ? `: ${lastLog.message}` : ''}`,
						);
					}
					if (genStatus !== 'COMPLETED') {
						throw new NodeOperationError(
							this.getNode(),
							'Timed out waiting for generation to complete; the post could not be scheduled',
						);
					}

					const outputResp = (await postNitroRequest.call(this, {
						method: 'GET',
						path: `/post/output/${embedPostId}`,
					})) as OutputResult;
					const design = (outputResp.data as any)?.result;
					const designId = design?.designId as string | undefined;
					if (!designId) {
						throw new NodeOperationError(
							this.getNode(),
							'Generation completed but no designId was returned, so the post could not be scheduled',
						);
					}

					const scheduleResp = (await postNitroRequest.call(this, {
						method: 'POST',
						path: '/schedule',
						body: buildScheduleBody(this, i, designId),
					})) as IDataObject;

					returnData.push({
						json: {
							embedPostId,
							design,
							scheduledPost: (scheduleResp.data as IDataObject) ?? scheduleResp,
						},
						pairedItem: { item: i },
					});
					continue;
				}

				const shouldWaitForCompletion = this.getNodeParameter('waitForCompletion', i) as boolean;
				if (!shouldWaitForCompletion) {
					returnData.push({
						json: startResp as unknown as IDataObject,
						pairedItem: { item: i },
					});
					continue;
				}

				const pollInterval = this.getNodeParameter('pollInterval', i) as number;
				const maxChecks = this.getNodeParameter('maxChecks', i) as number;
				const onComplete = this.getNodeParameter('onComplete', i) as 'status' | 'output';

				const statusResp = await waitForCompletion.call(this, embedPostId, pollInterval, maxChecks);
				const status = statusResp?.data?.embedPost?.status;

				if (status === 'FAILED') {
					const lastLog = (statusResp.data.logs || []).slice(-1)[0];
					throw new NodeOperationError(
						this.getNode(),
						`Generation failed${lastLog?.message ? `: ${lastLog.message}` : ''}`,
					);
				}

				if (onComplete === 'status') {
					returnData.push({
						json: statusResp as unknown as IDataObject,
						pairedItem: { item: i },
					});
					continue;
				}

				// Fetch output
				const outputResp = (await postNitroRequest.call(this, {
					method: 'GET',
					path: `/post/output/${embedPostId}`,
				})) as OutputResult;

				const download = this.getNodeParameter('download', i, false) as boolean;
				const { result, embedPost } = outputResp.data as any;
				const resultData = result?.data as string | string[] | undefined;

				// DESIGN responses (and any output without rendered files) have no binary to attach.
				if (!download || resultData === undefined) {
					returnData.push({
						json: outputResp as unknown as IDataObject,
						pairedItem: { item: i },
					});
					continue;
				}

				// Prepare binary
				const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
				const mimeType = result.mimeType as string;
				const extension = mimeType.split('/')[1] || 'bin';
				const baseFileName = result.name || 'post';

				const toBufferFromUrl = async (url: string): Promise<Buffer> => {
					const resp = await this.helpers.httpRequest({
						method: 'GET',
						url,
						json: false,
						encoding: null,
					});
					if (Buffer.isBuffer(resp)) return resp as Buffer;
					return Buffer.from(resp);
				};

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
						pairedItem: { item: i },
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
						pairedItem: { item: i },
					});
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
