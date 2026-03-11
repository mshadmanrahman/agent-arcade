# Contributing to Agent Arcade

Thanks for your interest in contributing! All contributions are welcome: features, bug fixes, documentation improvements, and more.

This project is licensed under the [MIT License](LICENSE), so your contributions will be too.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- [VS Code](https://code.visualstudio.com/) or [Cursor](https://cursor.com/) (v1.85.0+)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)

### Setup

```bash
git clone https://github.com/mshadmanrahman/agent-arcade.git
cd agent-arcade
npm install
npm run compile
```

Press **F5** in VS Code to launch the Extension Development Host.

## Project Structure

| Directory | Description |
|---|---|
| `src/` | Extension backend: Node.js, VS Code API |
| `src/webview/` | Canvas-based webview: game loop, sprites, office rendering |
| `scripts/` | Build tooling: sprite data generation, esbuild bundler |
| `media/` | Static assets: character PNGs, fonts, tilesets |
| `out/` | Build output (gitignored) |

## Code Guidelines

### Constants

No hardcoded magic numbers in source files. Use named constants at the top of each module.

### UI Styling

The project uses a pixel art aesthetic:
- Sharp corners (`border-radius: 0`)
- Solid backgrounds and `2px solid` borders
- Hard offset shadows (`2px 2px 0px`, no blur)
- CSS custom properties (`--pixel-*`) defined in `index.html`
- Monospace font throughout

### Immutability

Agent state uses immutable patterns: always spread and return new objects, never mutate in place. This is critical for the game loop's correctness.

### TypeScript

- Strict mode enabled
- `rootDir: "src"` for the extension backend
- Webview code is bundled separately via esbuild (not compiled by tsc)

## Build Commands

| Command | Description |
|---|---|
| `npm run compile` | Full build: generate sprites, compile TypeScript, bundle webview |
| `npm run watch` | TypeScript watch mode (webview requires manual rebuild) |
| `npm run bundle-webview` | Rebuild webview bundle only |
| `npx vsce package --no-dependencies` | Create .vsix for distribution |

## Submitting a Pull Request

1. Fork the repo and create a feature branch from `main`
2. Make your changes
3. Run the full build: `npm run compile`
4. Test in the Extension Development Host (F5)
5. Open a PR with:
   - Clear description of what changed and why
   - How you tested the changes
   - Screenshots for any UI changes

## Reporting Bugs

Open an issue with:
- What you expected vs what happened
- Steps to reproduce
- VS Code/Cursor version and OS
