# Image Generation MCP

Image Generation MCP adds an image-generation tool to VS Code Copilot through VS Code's MCP server provider API. It also provides a **Generate Image** command in the Command Palette.

## Setup

1. Set `imageGenerationMcp.endpoint` to your provider's OpenAI Images-compatible generation endpoint (for example, `https://api.example.com/v1/images/generations`).
2. Run **Image Generation MCP: Configure Image Provider API Key** and enter the key. It is stored using VS Code SecretStorage, not in settings.
3. Reload the VS Code window or refresh MCP servers from Copilot Chat.
4. Ask Copilot to generate an image, or run **Image Generation MCP: Generate Image**.

The endpoint should accept `POST` requests with `model`, `prompt`, and `size` fields and return an image response as `data[0].b64_json`, `data[0].url`, or raw PNG/JPEG bytes.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `imageGenerationMcp.enabled` | `true` | Enable or disable the MCP server. |
| `imageGenerationMcp.endpoint` | `""` | OpenAI Images-compatible endpoint. Required for image generation. |
| `imageGenerationMcp.model` | `gpt-image-1` | Model name sent to the endpoint. |
| `imageGenerationMcp.defaultWidth` | `512` | Default image width in pixels (64–2048). |
| `imageGenerationMcp.defaultHeight` | `512` | Default image height in pixels (64–2048). |
| `imageGenerationMcp.defaultFormat` | `png` | Default output format (`png` or `jpeg`). |

The MCP tool is named `generate_image` and accepts `prompt`, optional `width`, `height`, and `format` arguments. The provider API key is stored separately in SecretStorage.

## Requirements

- VS Code 1.145 or later.
- An image generation provider implementing the endpoint contract described above.

## Development

- `npm run compile` checks types, lints the extension, and bundles the extension and MCP server.
- `npm test` runs the extension tests.

## Release Notes

### 0.0.1

- Replaced the Hello World scaffold with an MCP image-generation service and VS Code command.
- Added provider settings and secure API key storage.
