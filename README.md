# Agent Arcade

**Visualize your Claude Code agents as pixel art characters in a virtual office.**

Each Claude Code terminal becomes an animated character that walks around a pixel art office, sits at a desk, and visually reflects what the agent is doing: typing when writing code, reading when searching files, walking when switching tasks.

Built for teams using Claude Code who want a fun, at-a-glance view of what their agents are up to.

## Features

- **One agent, one character**: every active Claude Code session gets its own animated pixel art character
- **Live activity tracking**: characters animate based on real-time transcript parsing (typing, reading, thinking, idle)
- **Sub-agent visualization**: when an agent spawns sub-agents via the Task tool, child characters appear linked to their parent with dashed connection lines
- **Spawn agents from the office**: click "+ Agent" to open a new Claude Code terminal, optionally with a task prompt
- **Click to inspect**: click any character to see model, branch, task summary, elapsed time, and sub-agent info
- **Wave goodbye**: when an agent finishes, its character waves, walks to the door, and fades out
- **6 diverse characters**: Metro City pixel art sprites with full 4-directional walk, typing, and reading animations
- **Dark pixel art aesthetic**: sharp corners, hard shadows, monospace fonts: the way pixel art should look

## Requirements

- VS Code or Cursor 1.85.0+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and configured

## Installation

### From VSIX (recommended for teams)

```bash
# Clone and build
git clone https://github.com/mshadmanrahman/agent-arcade.git
cd agent-arcade
npm install
npm run compile

# Package
npx vsce package --no-dependencies

# Install in VS Code / Cursor
code --install-extension agent-arcade-0.1.0.vsix
# or
cursor --install-extension agent-arcade-0.1.0.vsix
```

### From source (development)

```bash
git clone https://github.com/mshadmanrahman/agent-arcade.git
cd agent-arcade
npm install
npm run compile
```

Press **F5** in VS Code to launch the Extension Development Host.

## Usage

1. Open the command palette (**Cmd+Shift+P** / **Ctrl+Shift+P**)
2. Run **"Agent Arcade: Open Office"**
3. Active Claude Code sessions appear as characters automatically
4. Click **+ Agent** to spawn a new Claude Code terminal
5. Click any character to inspect its status

### How characters behave

| Agent activity | Character animation |
|---|---|
| Writing/editing files | Typing at desk |
| Reading/searching files | Reading at desk |
| Running sub-agents | Thinking (sparkle effect on parent) |
| Idle / between turns | Standing, occasionally wandering |
| Session ends | Waves goodbye, walks to door, fades out |

## Architecture

```
src/
  extension.ts          Entry point: commands, status bar, agent bridge
  agentMonitor.ts       Watches ~/.claude/projects/ for JSONL transcripts
  webviewProvider.ts    WebviewPanel lifecycle and message dispatch
  types.ts              Shared TypeScript interfaces

src/webview/
  renderer.ts           Game loop (30fps), canvas rendering, click handling
  sprites.ts            Sprite sheet loader (Metro City PNGs via base64)
  spriteAssets.ts       Auto-generated base64 data URIs (build artifact)
  agents.ts             Character state machine and pathfinding
  office.ts             Tile map, office layout, tile rendering
  pathfinding.ts        BFS pathfinding on the tile grid
  index.html            Webview HTML with pixel art CSS

scripts/
  generate-sprite-data.js   Converts character PNGs to base64 TypeScript
  bundle-webview.js         esbuild bundler for webview code

media/characters/
  char_0.png - char_5.png   Metro City sprite sheets (112x96 each)
```

### How it works

1. **AgentMonitor** polls `~/.claude/projects/` for JSONL transcript files less than 1 hour old
2. It parses the last 20 lines of each transcript to determine agent state (tool_use events map to activities)
3. State changes are bridged to the webview via `postMessage`
4. The webview runs a canvas game loop: characters pathfind to desks, animate based on state, and render with Y-sorted depth

### Sprite system

Each character is a 112x96 PNG sprite sheet:
- **7 columns** (16px each): walk1, walk2, walk3, type1, type2, read1, read2
- **3 rows** (32px each): Down, Up, Right
- Left direction = Right row flipped horizontally at runtime
- Idle pose = walk frame 1 (neutral standing)
- Rendered at 3x scale (48x96 pixels)

At build time, PNGs are converted to base64 data URIs and embedded in the JS bundle (webview CSP blocks file:// URLs).

## Configuration

| Setting | Default | Description |
|---|---|---|
| `agentArcade.soundEnabled` | `true` | Play notification when an agent completes |
| `agentArcade.transcriptPath` | `""` | Custom Claude Code transcript path (auto-detected if empty) |

## Credits and Acknowledgments

This project is inspired by and builds upon the work of several creators:

- **[Agent Arcade](https://github.com/pablodelucca/agent-arcade)** by Pablo De Lucca: the original VS Code extension that pioneered the concept of visualizing AI agents as pixel art office characters. This project follows the same architecture patterns, sprite format, and visual language.

- **[Metro City Character Pack](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack)** by JIK-A-4: the character sprites used in this extension. Free for personal and commercial use.

- **Claude Code** by Anthropic: the AI coding agent whose JSONL transcripts power the activity detection.

## Contributing

Contributions welcome! See CONTRIBUTING.md in the repository for guidelines.

```bash
# Development workflow
npm install
npm run compile        # Full build (sprites + TypeScript + esbuild bundle)
npm run watch          # TypeScript watch mode (rebuild webview manually)
npm run bundle-webview # Rebuild webview only
```

## License

MIT. See LICENSE file in the repository.
