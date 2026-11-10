import * as vscode from 'vscode';
import { activateImageGenerationMcp } from './imageGeneration';

export function activate(context: vscode.ExtensionContext): void {
	activateImageGenerationMcp(context);
}

export function deactivate(): void {
	// no-op
}

