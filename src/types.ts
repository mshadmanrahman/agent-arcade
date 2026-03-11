/** Agent activity states driving character animations */
export type AgentState = 'idle' | 'walking' | 'typing' | 'reading' | 'thinking' | 'done' | 'error' | 'spawning' | 'waving' | 'departing' | 'fading';

/** Direction the character sprite faces */
export type Direction = 'down' | 'up' | 'left' | 'right';

/** One of six distinct character appearances */
export type CharacterVariant = 0 | 1 | 2 | 3 | 4 | 5;

/** Grid position in tile coordinates */
export interface TilePos {
  readonly x: number;
  readonly y: number;
}

/** Pixel position for rendering */
export interface PixelPos {
  readonly x: number;
  readonly y: number;
}

/** Represents a single agent character in the office */
export interface AgentCharacter {
  readonly id: string;
  readonly name: string;
  readonly variant: CharacterVariant;
  readonly model: string;
  readonly branch: string;
  readonly state: AgentState;
  readonly direction: Direction;
  readonly tilePos: TilePos;
  readonly targetTilePos: TilePos | null;
  readonly path: readonly TilePos[];
  readonly animFrame: number;
  readonly taskSummary: string;
  readonly startedAt: number;
  readonly deskTile: TilePos;
}

/** Tile types for the office map */
export type TileType = 'floor' | 'wall' | 'desk' | 'chair' | 'plant' | 'server' | 'coffee' | 'empty';

/** Office tile with type and optional metadata */
export interface OfficeTile {
  readonly type: TileType;
  readonly variant?: number;
}

/** Message from extension to webview */
export interface ExtToWebviewMessage {
  readonly type: 'agentUpdate' | 'agentAdd' | 'agentRemove' | 'soundToggle';
  readonly payload: unknown;
}

/** Message from webview to extension */
export interface WebviewToExtMessage {
  readonly type: 'agentClicked' | 'ready' | 'soundToggle';
  readonly payload: unknown;
}

/** Parsed Claude Code transcript entry */
export interface TranscriptEntry {
  readonly type: string;
  readonly timestamp: string;
  readonly message?: string;
  readonly tool?: string;
  readonly result?: string;
}

/** Detected agent from Claude Code transcripts */
export interface DetectedAgent {
  readonly id: string;
  readonly sessionPath: string;
  readonly model: string;
  readonly branch: string;
  readonly lastActivity: AgentState;
  readonly lastMessage: string;
  readonly lastUpdate: number;
}
