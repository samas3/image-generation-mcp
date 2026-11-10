import * as assert from 'assert';
import { generateImage, normalizeDimensions } from '../imageGenerator';

suite('Image generation', () => {
	test('normalizes image dimensions to supported limits', () => {
		assert.deepStrictEqual(normalizeDimensions(32, 4096, 512, 512), {
			width: 64,
			height: 2048
		});
		assert.deepStrictEqual(normalizeDimensions(undefined, Number.NaN, 384, 640), {
			width: 384,
			height: 640
		});
	});

	test('requires a configured generation endpoint', async () => {
		await assert.rejects(
			generateImage(
				{ prompt: 'A mountain lake' },
				{
					endpoint: '',
					model: 'test-model',
					defaultWidth: 512,
					defaultHeight: 512,
					defaultFormat: 'png'
				}
			),
			/Configure imageGenerationMcp\.endpoint/
		);
	});

	test('returns generated image bytes from an OpenAI-compatible response', async () => {
		const originalFetch = globalThis.fetch;
		let requestBody: string | undefined;
		globalThis.fetch = async (_input, init) => {
			requestBody = typeof init?.body === 'string' ? init.body : undefined;
			return new Response(
				JSON.stringify({ data: [{ b64_json: Buffer.from('image bytes').toString('base64') }] }),
				{ headers: { 'content-type': 'application/json' } }
			);
		};

		try {
			const image = await generateImage(
				{ prompt: 'A mountain lake', width: 256, height: 128 },
				{
					endpoint: 'https://images.example.test/v1/images/generations',
					apiKey: 'test-key',
					model: 'test-model',
					defaultWidth: 512,
					defaultHeight: 512,
					defaultFormat: 'png'
				}
			);
			assert.deepStrictEqual(JSON.parse(requestBody ?? ''), {
				model: 'test-model',
				prompt: 'A mountain lake',
				size: '256x128'
			});
			assert.strictEqual(image.mimeType, 'image/png');
			assert.strictEqual(Buffer.from(image.data).toString(), 'image bytes');
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test('surfaces provider errors instead of returning a fake image', async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = async () => new Response('provider unavailable', { status: 503 });

		try {
			await assert.rejects(
				generateImage(
					{ prompt: 'A mountain lake' },
					{
						endpoint: 'https://images.example.test/v1/images/generations',
						model: 'test-model',
						defaultWidth: 512,
						defaultHeight: 512,
						defaultFormat: 'png'
					}
				),
				/HTTP 503/
			);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
