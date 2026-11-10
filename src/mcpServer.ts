import { createInterface } from 'node:readline';
import { generateImage, ImageGenerationOptions, ImageProviderConfig } from './imageGenerator';

interface JsonRpcRequest {
	jsonrpc: '2.0';
	id?: string | number | null;
	method: string;
	params?: Record<string, unknown>;
}

interface JsonRpcResponse {
	jsonrpc: '2.0';
	id: string | number | null;
	result?: unknown;
	error?: { code: number; message: string };
}

const config: ImageProviderConfig = {
	endpoint: process.env.IMAGE_GENERATION_MCP_ENDPOINT ?? '',
	apiKey: process.env.IMAGE_GENERATION_MCP_API_KEY ?? '',
	model: process.env.IMAGE_GENERATION_MCP_MODEL ?? 'gpt-image-1',
	defaultWidth: Number(process.env.IMAGE_GENERATION_MCP_DEFAULT_WIDTH) || 512,
	defaultHeight: Number(process.env.IMAGE_GENERATION_MCP_DEFAULT_HEIGHT) || 512,
	defaultFormat: process.env.IMAGE_GENERATION_MCP_DEFAULT_FORMAT === 'jpeg' ? 'jpeg' : 'png'
};

const tool = {
	name: 'generate_image',
	description: 'Generate an image from a text prompt using the configured image generation provider.',
	inputSchema: {
		type: 'object',
		properties: {
			prompt: { type: 'string', description: 'Text description of the image to create.' },
			width: { type: 'integer', minimum: 64, maximum: 2048 },
			height: { type: 'integer', minimum: 64, maximum: 2048 },
			format: { type: 'string', enum: ['png', 'jpeg'] }
		},
		required: ['prompt'],
		additionalProperties: false
	}
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
	return isRecord(value)
		&& value.jsonrpc === '2.0'
		&& typeof value.method === 'string'
		&& (value.id === undefined || value.id === null || typeof value.id === 'string' || typeof value.id === 'number');
}

function respond(response: JsonRpcResponse): void {
	process.stdout.write(`${JSON.stringify(response)}\n`);
}

async function callTool(params: Record<string, unknown> | undefined): Promise<unknown> {
	if (!params || params.name !== tool.name || !isRecord(params.arguments)) {
		throw new Error(`Unknown tool or invalid arguments. Use the "${tool.name}" tool.`);
	}

	const args = params.arguments;
	if (typeof args.prompt !== 'string' || !args.prompt.trim()) {
		throw new Error('The prompt argument must be a non-empty string.');
	}
	const width = args.width;
	if (width !== undefined && (typeof width !== 'number' || !Number.isInteger(width))) {
		throw new Error('The width argument must be an integer.');
	}
	const height = args.height;
	if (height !== undefined && (typeof height !== 'number' || !Number.isInteger(height))) {
		throw new Error('The height argument must be an integer.');
	}
	const format = args.format;
	if (format !== undefined && format !== 'png' && format !== 'jpeg') {
		throw new Error('The format argument must be "png" or "jpeg".');
	}

	const options: ImageGenerationOptions = {
		prompt: args.prompt,
		width: typeof width === 'number' ? width : undefined,
		height: typeof height === 'number' ? height : undefined,
		format: format === 'png' || format === 'jpeg' ? format : undefined
	};
	const image = await generateImage(options, config);
	return {
		content: [
			{ type: 'text', text: `Generated an image (${image.mimeType}).` },
			{
				type: 'image',
				data: Buffer.from(image.data).toString('base64'),
				mimeType: image.mimeType
			}
		]
	};
}

async function handleRequest(request: JsonRpcRequest): Promise<void> {
	if (request.id === undefined) {
		return;
	}

	try {
		let result: unknown;
		switch (request.method) {
			case 'initialize':
				result = {
					protocolVersion: '2025-03-26',
					capabilities: { tools: {} },
					serverInfo: { name: 'image-generation-mcp', version: '0.0.1' }
				};
				break;
			case 'ping':
				result = {};
				break;
			case 'tools/list':
				result = { tools: [tool] };
				break;
			case 'tools/call':
				try {
					result = await callTool(request.params);
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					result = { isError: true, content: [{ type: 'text', text: message }] };
				}
				break;
			default:
				respond({
					jsonrpc: '2.0',
					id: request.id,
					error: { code: -32601, message: `Method not found: ${request.method}` }
				});
				return;
		}

		respond({ jsonrpc: '2.0', id: request.id, result });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		respond({
			jsonrpc: '2.0',
			id: request.id,
			error: { code: -32603, message }
		});
	}
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', (line) => {
	let message: unknown;
	try {
		message = JSON.parse(line);
	} catch {
		process.stderr.write('Ignoring invalid JSON-RPC input.\n');
		return;
	}

	if (!isJsonRpcRequest(message)) {
		process.stderr.write('Ignoring invalid JSON-RPC request.\n');
		return;
	}

	void handleRequest(message);
});
