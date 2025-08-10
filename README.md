# n8n-nodes-postnitro

This is an n8n community node. It lets you use [PostNitro](https://postnitro.ai) in your n8n workflows.

PostNitro.ai is a platform for creating and publishing social media carousels and visuals.

The PostNitro Embed API is an embed-friendly API to generate carousel posts, images, and PDFs using AI or imported slide content to create carousels.


[Installation](#installation)  
[Operations](#operations)  
[Credentials](#credentials)  
[Compatibility](#compatibility)  
[Usage](#usage)  
[Resources](#resources)  
[Version history](#version-history)  

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

## Operations

The PostNitro node supports:
- Generate Carousel from Text (AI)
- Generate Carousel from Article URL (AI)
- Generate Carousel from X (Twitter) Post (AI)
- Import Carousel Slides

Optional behaviors:
- Wait for completion: Poll the post status until it completes or fails
- On complete: Return status only, or fetch the generated output
- Download output as binary: Attach the generated file(s) to the workflow item

## Credentials

This node requires API credentials for the PostNitro Embed API.

Prerequisites:
- A PostNitro account and API key

Setup in n8n:
- Create credentials of type `PostNitro Embed API`
- Fields:
  - API Base URL: Base URL of the PostNitro Embed API (for example, `https://embed-api.postnitro.ai`)
  - API Key: Your API key (sent as `embed-api-key` header)

## Compatibility

- Minimum n8n version: 1.0+
- Tested with `n8n-workflow` ^1.40.0 and TypeScript ^5.4.0

## Usage

Basic flow:
1. Choose an operation (AI generation from Text/Article/X, or Import Slides)
2. Provide required fields such as `templateId`, `brandId`, and (for AI flows) `presetId`
3. Optionally enable "Wait for Completion" to poll status and then fetch output
4. If you choose to fetch output, you can return just the JSON or download the file(s) as binary

Output formats:
- PDF: Single file
- PNG: Multiple images (array). If "Download Output as Binary" is enabled, multiple binary properties will be attached (e.g., `data1`, `data2`, ...)

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [PostNitro Embed API documentation](https://postnitro.ai/docs/embed/api)

## Version history

- 0.1.0: Initial release with AI generation (Text/Article/X), Import Slides, status polling, and binary download options.
