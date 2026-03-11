/**
 * Metro City character sprite system.
 * Loads pre-colored PNG sprite sheets (112x96 each, 7 frames x 3 directions).
 * Frame layout per sheet:
 *   Columns (16px each): walk1, walk2, walk3, type1, type2, read1, read2
 *   Rows (32px each): Down (0), Up (1), Right (2)
 *   Left direction = horizontally flipped Right at runtime.
 *   Idle pose = walk frame 1 (the neutral standing pose).
 */

import { SPRITE_SHEET_URIS } from './spriteAssets';

const FRAME_W = 16;
const FRAME_H = 32;
const SCALE = 3;
const RENDER_W = FRAME_W * SCALE; // 48
const RENDER_H = FRAME_H * SCALE; // 96

/** Direction -> sprite sheet row index */
const DIR_ROW: Record<string, number> = {
  down: 0,
  up: 1,
  right: 2,
  left: 2, // same row as right, drawn flipped
};

/** State -> column indices in the sprite sheet */
const STATE_FRAMES: Record<string, number[]> = {
  walk:    [0, 1, 2],
  type:    [3, 4],
  read:    [5, 6],
  idle:    [1],        // walk2 = neutral standing pose
};

/** Accent colors per character variant (for UI: name tags, selection, badges) */
const VARIANT_ACCENTS = [
  '#60A5FA', // char_0: blue
  '#34D399', // char_1: green
  '#F87171', // char_2: red
  '#A78BFA', // char_3: purple
  '#FB923C', // char_4: orange
  '#22D3EE', // char_5: cyan
];

/** Loaded Image elements (one per character variant) */
const sheetImages: HTMLImageElement[] = [];
let sheetsLoaded = false;

/** Cache: "variant_col_row_flip" -> pre-rendered canvas */
const frameCache = new Map<string, HTMLCanvasElement>();

/** Placeholder canvas for use before images load */
let placeholderCanvas: HTMLCanvasElement | null = null;

function getPlaceholder(): HTMLCanvasElement {
  if (placeholderCanvas) return placeholderCanvas;
  placeholderCanvas = document.createElement('canvas');
  placeholderCanvas.width = RENDER_W;
  placeholderCanvas.height = RENDER_H;
  const ctx = placeholderCanvas.getContext('2d')!;
  ctx.fillStyle = '#475569';
  ctx.fillRect(8, 24, 32, 48);
  ctx.fillStyle = '#94A3B8';
  ctx.beginPath();
  ctx.arc(24, 18, 10, 0, Math.PI * 2);
  ctx.fill();
  return placeholderCanvas;
}

/** Initialize: load all sprite sheet images from base64 data URIs */
function initSheets(): void {
  if (sheetImages.length > 0) return;

  let loadCount = 0;
  const total = SPRITE_SHEET_URIS.length;

  for (let i = 0; i < total; i++) {
    const img = new Image();
    img.onload = () => {
      loadCount++;
      if (loadCount === total) {
        sheetsLoaded = true;
      }
    };
    img.src = SPRITE_SHEET_URIS[i];
    sheetImages.push(img);
  }
}

// Start loading immediately on module init
initSheets();

/**
 * Extract a single frame from a sprite sheet and render it scaled.
 * Handles horizontal flip for left-facing direction.
 */
function renderFrame(variant: number, col: number, row: number, flip: boolean): HTMLCanvasElement {
  const key = `${variant}_${col}_${row}_${flip ? 1 : 0}`;
  const cached = frameCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = RENDER_W;
  canvas.height = RENDER_H;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const img = sheetImages[variant % sheetImages.length];
  if (!img || !img.complete) return getPlaceholder();

  const srcX = col * FRAME_W;
  const srcY = row * FRAME_H;

  if (flip) {
    ctx.save();
    ctx.translate(RENDER_W, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(img, srcX, srcY, FRAME_W, FRAME_H, 0, 0, RENDER_W, RENDER_H);
    ctx.restore();
  } else {
    ctx.drawImage(img, srcX, srcY, FRAME_W, FRAME_H, 0, 0, RENDER_W, RENDER_H);
  }

  frameCache.set(key, canvas);
  return canvas;
}

/**
 * Map agent state to sprite sheet frame category.
 * States that don't have dedicated sprites use the closest match.
 */
function stateToCategory(state: string): string {
  switch (state) {
    case 'typing':
    case 'thinking':
    case 'spawning':
      return 'type';
    case 'reading':
      return 'read';
    case 'walking':
    case 'departing':
      return 'walk';
    case 'idle':
    case 'done':
    case 'error':
    case 'waving':
    case 'fading':
    default:
      return 'idle';
  }
}

/**
 * Get the correct sprite canvas for a character's current state.
 * Returns a scaled canvas ready to draw.
 */
export function getSpriteCanvas(
  variant: number,
  state: string,
  direction: string,
  frame: number
): HTMLCanvasElement {
  if (!sheetsLoaded) return getPlaceholder();

  const category = stateToCategory(state);
  const columns = STATE_FRAMES[category] || STATE_FRAMES['idle'];
  const col = columns[frame % columns.length];
  const row = DIR_ROW[direction] ?? 0;
  const flip = direction === 'left';

  return renderFrame(variant, col, row, flip);
}

/** Width of rendered sprite in pixels */
export function getSpriteWidth(): number {
  return RENDER_W;
}

/** Height of rendered sprite in pixels */
export function getSpriteHeight(): number {
  return RENDER_H;
}

/** Legacy: returns width for backward compat with renderer code expecting square */
export function getSpriteRenderSize(): number {
  return RENDER_W;
}

export function getVariantCount(): number {
  return SPRITE_SHEET_URIS.length;
}

/** Get the accent color for a character variant (for UI elements like name tags) */
export function getVariantAccent(variant: number): string {
  return VARIANT_ACCENTS[variant % VARIANT_ACCENTS.length];
}
