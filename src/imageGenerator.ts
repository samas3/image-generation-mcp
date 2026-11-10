export interface ImageGenerationOptions {
	prompt: string;
	width?: number;
	height?: number;
	format?: 'png' | 'jpeg';
}

export interface ImageProviderConfig {
	endpoint: string;
	apiKey?: string;
	model: string;
	defaultWidth: number;
	defaultHeight: number;
	defaultFormat: 'png' | 'jpeg';
}

export interface GeneratedImage {
	data: Uint8Array;
	mimeType: 'image/png' | 'image/jpeg';
}

export function normalizeDimensions(
	width: number | undefined,
	height: number | undefined,
	defaultWidth: number,
	defaultHeight: number
): { width: number; height: number } {
	const normalize = (value: number | undefined, fallback: number): number =>
		Math.max(64, Math.min(2048, Math.round(Number.isFinite(value) ? value! : fallback)));
	return {
		width: normalize(width, defaultWidth),
		height: normalize(height, defaultHeight)
	};
}

export async function generateImage(
	options: ImageGenerationOptions,
	config: ImageProviderConfig,
	token?: AbortSignal
): Promise<GeneratedImage> {
	const endpoint = config.endpoint.trim();
	if (!endpoint) {
		throw new Error('Configure imageGenerationMcp.endpoint before generating images.');
	}

	const prompt = options.prompt.trim();
	if (!prompt) {
		throw new Error('An image prompt is required.');
	}

	const { width, height } = normalizeDimensions(
		options.width,
		options.height,
		config.defaultWidth,
		config.defaultHeight
	);
	const format = options.format ?? config.defaultFormat;
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (config.apiKey) {
		headers.Authorization = `Bearer ${config.apiKey}`;
	}

	const response = await fetch(endpoint, {
		method: 'POST',
		headers,
		signal: token,
		body: JSON.stringify({
			model: config.model,
			prompt,
			size: `${width}x${height}`
		})
	});

	if (!response.ok) {
		const detail = (await response.text()).slice(0, 500);
		throw new Error(`Image endpoint returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
	}

	const contentType = response.headers.get('content-type') ?? '';
	let bytes: Uint8Array;
	let resultMimeType: 'image/png' | 'image/jpeg' = format === 'jpeg' ? 'image/jpeg' : 'image/png';

	if (contentType.includes('application/json')) {
		const result: unknown = await response.json();
		if (!isImageResponse(result)) {
			throw new Error('Image endpoint returned an unsupported response. Expected data[0].b64_json or data[0].url.');
		}

		const imageResult = result.data[0];
		if (imageResult.b64_json) {
			bytes = new Uint8Array(Buffer.from(imageResult.b64_json, 'base64'));
		} else if (imageResult.url) {
			const imageResponse = await fetch(imageResult.url, { signal: token });
			if (!imageResponse.ok) {
				throw new Error(`Image download returned HTTP ${imageResponse.status}`);
			}
			bytes = new Uint8Array(await imageResponse.arrayBuffer());
			resultMimeType = normalizeMimeType(imageResponse.headers.get('content-type'), resultMimeType);
		} else {
			throw new Error('Image endpoint response did not contain image data.');
		}
	} else if (contentType.startsWith('image/')) {
		bytes = new Uint8Array(await response.arrayBuffer());
		resultMimeType = normalizeMimeType(contentType, resultMimeType);
	} else {
		throw new Error(`Image endpoint returned unsupported content type: ${contentType || 'unknown'}`);
	}

	if (!bytes.byteLength) {
		throw new Error('Image endpoint returned an empty image.');
	}

	return { data: bytes, mimeType: resultMimeType };
}

function isImageResponse(value: unknown): value is {
	data: Array<{ b64_json?: string; url?: string }>;
} {
	if (typeof value !== 'object' || value === null || !('data' in value)) {
		return false;
	}
	const data = (value as { data?: unknown }).data;
	return Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null;
}

function normalizeMimeType(contentType: string | null, fallback: 'image/png' | 'image/jpeg'): 'image/png' | 'image/jpeg' {
	if (contentType?.toLowerCase().startsWith('image/jpeg')) {
		return 'image/jpeg';
	}
	if (contentType?.toLowerCase().startsWith('image/png')) {
		return 'image/png';
	}
	return fallback;
}
