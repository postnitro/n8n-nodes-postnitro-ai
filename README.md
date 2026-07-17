# n8n-nodes-postnitro-ai

This is an n8n community node. It lets you use [PostNitro](https://postnitro.ai) in your n8n workflows.

**Turn ideas, articles, or posts into branded carousels and images — then schedule them straight to your social accounts.**

This node generates carousels and single images (as PNG, PDF, or an editable design) using AI or your own imported content, and schedules those posts to LinkedIn, Instagram, TikTok, and Threads.


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

The PostNitro node is organized into three resources.

### Create Post

Create a `Carousel` or a single `Image` (choose via **Post Type**):
- Generate from Text (AI)
- Generate from an Article URL (AI)
- Generate from an X (Twitter) Post (AI)
- Import Slides / Image Content — provide your own content as JSON (an array of slides for a carousel, a single object for an image). Supports the infographic `layoutType`/`layoutConfig` fields.

Response types:
- `PDF` — single document
- `PNG` — one image per slide
- `Design` — skips rendering and returns a `designId` you can pass to a Scheduled Post

Optional behaviors:
- Wait for completion: Poll the post status until it completes or fails
- On complete: Return status only, or fetch the generated output
- Download output as binary: Attach the generated file(s) to the workflow item (not applicable to the `Design` response type)

Template, Brand, and (for AI) AI Preset are selected from dropdowns that load from your workspace.

**AI images (optional):** enable **Generate AI Images** to have AI create images and bake them into the post before rendering — available on every generate/import operation (including **Create & Schedule**), for both carousels and images. Choose **Image Placement** (`Auto` / `Background` / `In-Line`) and **Image Strategy** (`Strategic` ≈ half the slides / `All` eligible slides), and optionally an **Image Context** brief. It is best-effort: the post still completes if images are skipped (e.g. Free plan or over the AI-image quota — AI images bill against a separate quota, not post credits).

### Scheduled Post

Plan, draft, and schedule social posts to LinkedIn, Instagram, TikTok, and Threads:
- Create — create a scheduled post or draft (`status` `SCHEDULED` or `DRAFT`)
- Get Many — list scheduled posts within a date range
- Update — update an existing scheduled post

A post needs **either** an attached `Design ID` (e.g. the `designId` returned by a Create Post output) **or** at least one caption in **Post Content**. Per-platform requirements are configured under **Platform Settings** (JSON per platform for LinkedIn, Instagram, TikTok, and Threads). See the [Schedule API docs](https://postnitro.ai/docs/embed/api/schedule) for the conditional rules.

The **Selected Accounts** field loads your connected social accounts automatically so you can pick which to publish to.

### Create & Schedule

One-shot helpers that create a post and schedule it in a single run:
- **Generate & Schedule (AI)** — generate with AI, then schedule the result
- **Import & Schedule** — import your own content, then schedule the result

Each helper generates/imports (internally using the `Design` response type), waits for the design, then creates the scheduled post from it — so the scheduling fields (accounts, captions, time, platform settings) appear right on the operation. It outputs `{ embedPostId, design, scheduledPost }`. Prefer to keep the steps separate? Use a **Create Post** operation followed by **Scheduled Post → Create** instead.

## Credentials

This node requires API credentials for the PostNitro Embed API.

Prerequisites:
- A PostNitro account and API key

Setup in n8n:
- Create credentials of type `PostNitro Embed API`
- Fields:
  - API Key: Your API key (sent as `embed-api-key` header)

## Compatibility

- Minimum n8n version: 1.0+
- Built against `n8n-workflow` ^2.16.0 and TypeScript ^5.4.0 (the `n8n-workflow` peer dependency is `*`, so the node runs on the version your n8n host provides)

## Usage

Basic generation flow:
1. Select the **Create Post** resource and an operation (AI generation from Text/Article/X, or Import Slides / Image Content)
2. Choose the **Post Type** (`Carousel` or `Image`)
3. Pick a **Template**, **Brand**, and (for AI flows) an **AI Preset** from the dropdowns
4. Optionally enable "Wait for Completion" to poll status and then fetch output
5. If you choose to fetch output, you can return just the JSON or download the file(s) as binary

Output formats:
- PDF: Single file
- PNG: Multiple images (array). If "Download Output as Binary" is enabled, multiple binary properties will be attached (e.g., `data1`, `data2`, ...)
- Design: No file is rendered; the output JSON contains a `designId` and `editorUrl`

Generate-then-schedule flow:
- **One step:** use the **Create & Schedule** resource (operation *Generate & Schedule (AI)* or *Import & Schedule*) — fill the generation fields plus the scheduling fields, and the node does the whole chain.
- **Two steps (more control):** run a plain generate/import (any response type — every output includes a `designId`), then feed that `designId` into a **Scheduled Post → Create** with accounts, captions, and a future `Scheduled At`.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [PostNitro Embed API documentation](https://postnitro.ai/docs/embed/api)

## Version history

- 0.1.0: Initial release with AI generation (Text/Article/X), Import Slides, status polling, and binary download options.
- 0.1.1: postType drop down set to CAROUSEL type only
- 0.1.2: implemented fixes suggested in node review
- 0.2.0: Renamed the generation resource to **Create Post** and added a single Image post type and the `Design` response type; new **Scheduled Post** resource (Create, Get Many, Update) with a social-account picker and Template/Brand/Preset dropdowns; new **Create & Schedule** resource with `Generate & Schedule (AI)` and `Import & Schedule` helpers; credentials simplified to just an API key.
- 0.2.1: Added optional **AI image generation** (`Generate AI Images`) on all generate/import operations; HTTP failures now raise `NodeApiError` (full response context, no serialization errors); published to npm with provenance via GitHub Actions.
- 0.2.2: Addressed the n8n community-node scanner review. Authenticated requests now use `httpRequestWithAuthentication()`; every in-loop error carries `{ itemIndex }` for correct per-item reporting; the node is now usable as a tool in AI agent workflows (`usableAsTool: true`); connection types use `NodeConnectionTypes.Main`; the credential exposes an `icon`; and the outer error handler wraps failures in `NodeApiError`. Upgraded `n8n-workflow` to `2.16.0` (removing an outdated local type shim) and set the peer dependency to `*`, plus assorted description/lint cleanups.