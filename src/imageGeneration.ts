import * as vscode from 'vscode';
import { generateImage, ImageGenerationOptions, ImageProviderConfig } from './imageGenerator';

const SECRET_KEY = 'imageGenerationMcp.apiKey';

function getProviderConfig(): ImageProviderConfig {
	const config = vscode.workspace.getConfiguration('imageGenerationMcp');
	return {
		endpoint: config.get<string>('endpoint', ''),
		model: config.get<string>('model', 'gpt-image-1'),
		defaultWidth: config.get<number>('defaultWidth', 512),
		defaultHeight: config.get<number>('defaultHeight', 512),
		defaultFormat: config.get<'png' | 'jpeg'>('defaultFormat', 'png')
	};
}

function createMcpServerDefinitionProvider(
	context: vscode.ExtensionContext
): vscode.McpServerDefinitionProvider<vscode.McpStdioServerDefinition> {
	const changes = new vscode.EventEmitter<void>();
	context.subscriptions.push(changes);
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
		if (event.affectsConfiguration('imageGenerationMcp')) {
			changes.fire();
		}
	}));

	return {
		onDidChangeMcpServerDefinitions: changes.event,
		provideMcpServerDefinitions: async () => {
			const config = getProviderConfig();
			if (!vscode.workspace.getConfiguration('imageGenerationMcp').get<boolean>('enabled', true)) {
				return [];
			}

			const apiKey = await context.secrets.get(SECRET_KEY);
			const server = new vscode.McpStdioServerDefinition(
				'Image Generation MCP',
				process.execPath,
				[vscode.Uri.joinPath(context.extensionUri, 'dist', 'mcpServer.js').fsPath],
				{
					IMAGE_GENERATION_MCP_ENDPOINT: config.endpoint,
					IMAGE_GENERATION_MCP_API_KEY: apiKey ?? '',
					IMAGE_GENERATION_MCP_MODEL: config.model,
					IMAGE_GENERATION_MCP_DEFAULT_WIDTH: config.defaultWidth,
					IMAGE_GENERATION_MCP_DEFAULT_HEIGHT: config.defaultHeight,
					IMAGE_GENERATION_MCP_DEFAULT_FORMAT: config.defaultFormat
				},
				'0.0.1'
			);
			return [server];
		}
	};
}

async function saveGeneratedImage(
	context: vscode.ExtensionContext,
	options: ImageGenerationOptions
): Promise<void> {
	const config = getProviderConfig();
	const extension = options.format === 'jpeg' ? 'jpg' : 'png';
	const destination = await vscode.window.showSaveDialog({
		saveLabel: 'Save generated image',
		filters: { Images: [extension] },
		defaultUri: vscode.workspace.workspaceFolders?.[0]
			? vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, `generated-image.${extension}`)
			: undefined
	});

	if (!destination) {
		return;
	}

	const apiKey = await context.secrets.get(SECRET_KEY);
	const image = await generateImage(options, { ...config, apiKey });
	await vscode.workspace.fs.writeFile(destination, image.data);
	vscode.window.showInformationMessage(`Image saved to ${destination.fsPath}`);
}

export function activateImageGenerationMcp(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.lm.registerMcpServerDefinitionProvider(
			'image-generation-mcp',
			createMcpServerDefinitionProvider(context)
		)
	);

	context.subscriptions.push(vscode.commands.registerCommand(
		'image-generation-mcp.generateImage',
		async () => {
			const prompt = await vscode.window.showInputBox({
				prompt: 'Describe the image to generate',
				placeHolder: 'A serene mountain lake at sunrise',
				ignoreFocusOut: true
			});
			if (!prompt?.trim()) {
				return;
			}

			const config = getProviderConfig();
			try {
				await vscode.window.withProgress({
					location: vscode.ProgressLocation.Notification,
					title: 'Generating image'
				}, () => saveGeneratedImage(context, { prompt, format: config.defaultFormat }));
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				await vscode.window.showErrorMessage(`Image generation failed: ${message}`);
			}
		}
	));

	context.subscriptions.push(vscode.commands.registerCommand(
		'image-generation-mcp.configureApiKey',
		async () => {
			const currentKey = await context.secrets.get(SECRET_KEY);
			const apiKey = await vscode.window.showInputBox({
				prompt: 'Enter the image provider API key, or leave empty to remove it',
				password: true,
				ignoreFocusOut: true,
				value: currentKey ?? ''
			});
			if (apiKey === undefined) {
				return;
			}

			if (apiKey.trim()) {
				await context.secrets.store(SECRET_KEY, apiKey.trim());
				vscode.window.showInformationMessage('Image provider API key saved securely.');
			} else {
				await context.secrets.delete(SECRET_KEY);
				vscode.window.showInformationMessage('Image provider API key removed.');
			}
		}
	));
}
