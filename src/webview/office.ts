/**
 * Office tile map: defines the layout of a multi-room pixel art office.
 *
 * Layout: 20x15 grid with two rooms + connecting hallway.
 *   - Work Area (left, 12x10): wood floor, desks, servers, plants
 *   - Lounge (right, 6x10): carpet floor, bookshelf, lamp, rugs
 *   - Hallway (bottom, 12x2): tile floor connecting both rooms
 *   - VOID tiles: black empty space between/around rooms
 *
 * Each tile is 48x48 pixels. Rendering is layered:
 *   1. Base layer: floor sprite or procedural floor
 *   2. Wall layer: autotiled walls with context-aware trim
 *   3. Overlay layer: furniture sprites on top of floor
 *   4. Ambient pass: shadows near walls, light pools from windows/lamps
 */

import { drawTileSprite, hasTileSprites } from './tileSprites';
import { renderTile, renderAmbientEffects } from './tileRenderer';
import { buildWallMask, renderAutoWall } from './wallTiles';

const TILE_SIZE = 48;

export type TileType =
  | 'floor' | 'floor_carpet' | 'floor_tile'
  | 'wall' | 'wall_top'
  | 'desk' | 'chair' | 'plant' | 'server' | 'coffee'
  | 'empty' | 'door' | 'void'
  | 'window' | 'whiteboard' | 'bookshelf' | 'watercooler' | 'rug' | 'lamp';

/** Which floor type underlies furniture in each zone */
export type FloorZone = 'wood' | 'carpet' | 'tile';

export interface OfficeTile {
  readonly type: TileType;
  readonly walkable: boolean;
  readonly floorZone: FloorZone;
}

/** Layout key: single character -> tile type */
const LAYOUT_KEY: Record<string, TileType> = {
  'W': 'wall',        'T': 'wall_top',     'F': 'floor',
  'D': 'desk',        'C': 'chair',        'P': 'plant',
  'S': 'server',      'K': 'coffee',       'E': 'empty',
  'R': 'door',        'N': 'window',       'H': 'whiteboard',
  'B': 'bookshelf',   'A': 'watercooler',  'G': 'rug',
  'L': 'lamp',        'V': 'void',
  // Lounge-specific (lowercase = carpet zone)
  'f': 'floor_carpet',
  // Hallway-specific
  't': 'floor_tile',
  // Lowercase aliases for mixed-case layout rows
  'r': 'door',
  'w': 'wall',
  'v': 'void',
};

/**
 * 15 rows x 20 cols multi-room office layout.
 *
 * Work Area (cols 0-11, rows 0-9):
 *   Wood floor, desks, chairs, servers, plants, watercooler, coffee
 *   Door at bottom wall (col 5, row 9)
 *
 * VOID gap (cols 12-13, rows 0-9):
 *   Empty space separating the two rooms
 *
 * Lounge (cols 14-19, rows 0-9):
 *   Carpet floor, bookshelf, lamp, rugs, plant
 *   Door at bottom wall (col 16, row 9)
 *
 * Hallway (cols 5-16, rows 10-11):
 *   Tile floor connecting both room doors
 *
 * VOID (remaining cells):
 *   Black empty space
 */
const OFFICE_LAYOUT: readonly string[] = [
  'WWNWWHWWWNWWVVWWNWNW', // row  0: top walls + windows/whiteboard
  'WPFDFDFFSFFWVVWPffLW', // row  1: plants, desks, server | lounge
  'WGFCFCFFFFFWVVWffGfW', // row  2: chairs, rug         | rug
  'WGFFFFFFFLFWVVWffBfW', // row  3: open area, lamp     | bookshelf
  'WFFDFDFFFFAKVVWffffW', // row  4: desks, watercooler  | carpet
  'WFFCFCFFFFBWVVWffffW', // row  5: chairs, bookshelf   | carpet
  'WFFFFFFFFFFWVVWffGfW', // row  6: open corridor       | rug
  'WFFDFDFFSPPWVVWffffW', // row  7: desks, server, plant| carpet
  'WFFCFCFFFFFWVVWffffW', // row  8: chairs              | carpet
  'WWWWWWrWWWWWvvwwrwww', // row  9: bottom walls + doors (work door col 6, lounge door col 16)
  'VVVVVttttttttttttVVV', // row 10: hallway
  'VVVVVttttttttttttVVV', // row 11: hallway
  'VVVVVVVVVVVVVVVVVVVV', // row 12: void
  'VVVVVVVVVVVVVVVVVVVV', // row 13: void
  'VVVVVVVVVVVVVVVVVVVV', // row 14: void
];

export const GRID_COLS = 20;
export const GRID_ROWS = 15;

export function getTileSize(): number {
  return TILE_SIZE;
}

export function getCanvasWidth(): number {
  return GRID_COLS * TILE_SIZE;
}

export function getCanvasHeight(): number {
  return GRID_ROWS * TILE_SIZE;
}

/** Tiles agents can walk through */
const WALKABLE_TYPES: ReadonlySet<TileType> = new Set([
  'floor', 'floor_carpet', 'floor_tile', 'door', 'rug',
]);

/** Furniture tiles: removed from baked background, rendered per-frame with Z-sorting */
export const FURNITURE_TYPES: ReadonlySet<TileType> = new Set([
  'desk', 'chair', 'plant', 'server', 'bookshelf', 'watercooler', 'lamp',
]);

/** Determine the floor zone based on grid position */
function getFloorZone(col: number, row: number): FloorZone {
  // Lounge: cols 14-19, rows 0-9
  if (col >= 14 && col <= 19 && row >= 0 && row <= 9) return 'carpet';
  // Hallway: rows 10-11
  if (row >= 10 && row <= 11) return 'tile';
  // Default: work area (wood)
  return 'wood';
}

function parseTile(char: string, col: number, row: number): OfficeTile {
  const type = LAYOUT_KEY[char] || 'floor';
  const walkable = WALKABLE_TYPES.has(type);
  const floorZone = getFloorZone(col, row);
  return { type, walkable, floorZone };
}

let tileGrid: OfficeTile[][] | null = null;

export function getGrid(): OfficeTile[][] {
  if (tileGrid) return tileGrid;
  tileGrid = OFFICE_LAYOUT.map((row, rowIdx) =>
    row.split('').map((char, colIdx) => parseTile(char, colIdx, rowIdx))
  );
  return tileGrid;
}

/** Reset grid cache (for layout switching) */
export function resetGrid(): void {
  tileGrid = null;
}

export function isWalkable(x: number, y: number): boolean {
  if (x < 0 || x >= GRID_COLS || y < 0 || y >= GRID_ROWS) return false;
  return getGrid()[y][x].walkable;
}

/** Get all desk-chair pairs (where agents sit) */
export function getDeskPositions(): Array<{
  desk: { x: number; y: number };
  chair: { x: number; y: number };
}> {
  const grid = getGrid();
  const desks: Array<{
    desk: { x: number; y: number };
    chair: { x: number; y: number };
  }> = [];

  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      if (grid[y][x].type === 'desk') {
        // Chair directly below the desk
        if (y + 1 < GRID_ROWS && grid[y + 1][x].type === 'chair') {
          desks.push({
            desk: { x, y },
            chair: { x, y: y + 1 },
          });
        }
      }
    }
  }
  return desks;
}

// ---------------------------------------------------------------------------
// Rendering: layered sprite + procedural system with wall autotiling
// ---------------------------------------------------------------------------

/** Tiles rendered as solid surfaces (no floor underneath) */
const SOLID_TILES: ReadonlySet<TileType> = new Set([
  'wall', 'wall_top', 'window', 'whiteboard', 'empty', 'desk', 'coffee', 'void',
]);

/** Map tile type -> overlay sprite name (drawn on top of floor) */
const OVERLAY_SPRITES: Partial<Record<TileType, string>> = {
  chair:       'chair_front',
  server:      'server_rack',
  watercooler: 'water_cooler',
};

/** Plants alternate between bushy/tall based on grid position */
function getPlantSprite(gx: number, gy: number): string {
  return (gx + gy) % 2 === 0 ? 'plant_bushy' : 'plant_tall';
}

/** Wall decorations: art and charts overlaid on specific wall positions */
interface WallDecoration {
  readonly x: number;
  readonly y: number;
  readonly sprite: string;
}

const WALL_DECORATIONS: readonly WallDecoration[] = [
  { x: 1,  y: 0, sprite: 'wall_art_1' },
  { x: 7,  y: 0, sprite: 'wall_chart' },
  { x: 10, y: 0, sprite: 'wall_art_2' },
];

/** Map floor zone to sprite name */
const FLOOR_SPRITES: Record<FloorZone, string> = {
  wood:   'floor_wood',
  carpet: 'floor_carpet',
  tile:   'floor_tile',
};

/** Render the complete office to a canvas context (called once at init) */
export function renderOffice(ctx: CanvasRenderingContext2D): void {
  const grid = getGrid();
  const useSprites = hasTileSprites();

  // Pass 1: render all tiles
  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      const tile = grid[y][x];
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;

      // VOID tiles: render as pure black
      if (tile.type === 'void') {
        renderTile(ctx, 'void', px, py, TILE_SIZE, x, y);
        continue;
      }

      // Wall tiles: use autotile system
      if (tile.type === 'wall') {
        const mask = buildWallMask(x, y, grid, GRID_ROWS, GRID_COLS);
        renderAutoWall(ctx, px, py, mask, x, y);
        continue;
      }

      // Furniture tiles: render only their floor (furniture drawn per-frame in Z-sort pass)
      if (FURNITURE_TYPES.has(tile.type)) {
        const floorSprite = FLOOR_SPRITES[tile.floorZone];
        const floorDrawn = useSprites &&
          drawTileSprite(ctx, floorSprite, px, py, TILE_SIZE);
        if (!floorDrawn) {
          const floorType = tile.floorZone === 'carpet' ? 'floor_carpet'
            : tile.floorZone === 'tile' ? 'floor_tile'
            : 'floor';
          renderTile(ctx, floorType, px, py, TILE_SIZE, x, y);
        }
        continue;
      }

      // Other solid tiles: render as one unit (no floor layer)
      if (SOLID_TILES.has(tile.type)) {
        renderTile(ctx, tile.type, px, py, TILE_SIZE, x, y);
        continue;
      }

      // Floor-based tiles: draw floor first, then overlay
      const floorSprite = FLOOR_SPRITES[tile.floorZone];
      const floorDrawn = useSprites &&
        drawTileSprite(ctx, floorSprite, px, py, TILE_SIZE);
      if (!floorDrawn) {
        // Procedural floor based on zone
        const floorType = tile.floorZone === 'carpet' ? 'floor_carpet'
          : tile.floorZone === 'tile' ? 'floor_tile'
          : 'floor';
        renderTile(ctx, floorType, px, py, TILE_SIZE, x, y);
      }

      // Pure floor types: no overlay needed
      if (tile.type === 'floor' || tile.type === 'floor_carpet' || tile.type === 'floor_tile') continue;

      // Try sprite overlay for this furniture type
      let overlayDrawn = false;

      if (tile.type === 'plant') {
        const plantSprite = getPlantSprite(x, y);
        overlayDrawn = useSprites && drawTileSprite(ctx, plantSprite, px, py, TILE_SIZE);
      } else {
        const spriteName = OVERLAY_SPRITES[tile.type];
        if (spriteName) {
          overlayDrawn = useSprites && drawTileSprite(ctx, spriteName, px, py, TILE_SIZE);
        }
      }

      // Fallback: procedural overlay for tiles without sprites
      if (!overlayDrawn) {
        renderTile(ctx, tile.type, px, py, TILE_SIZE, x, y);
      }
    }
  }

  // Pass 2: wall decorations (sprite art overlaid on wall tiles)
  if (useSprites) {
    for (const deco of WALL_DECORATIONS) {
      drawTileSprite(ctx, deco.sprite, deco.x * TILE_SIZE, deco.y * TILE_SIZE, TILE_SIZE);
    }
  }

  // Pass 3: ambient effects (shadows, light pools)
  renderAmbientEffects(ctx, grid, GRID_ROWS, GRID_COLS, TILE_SIZE);
}

/** Render a single furniture tile with sprite support (for Z-sort pass) */
export function renderFurnitureTile(
  ctx: CanvasRenderingContext2D,
  type: TileType,
  px: number,
  py: number,
  gridX: number,
  gridY: number,
): void {
  const useSprites = hasTileSprites();

  if (type === 'plant') {
    const plantSprite = getPlantSprite(gridX, gridY);
    if (useSprites && drawTileSprite(ctx, plantSprite, px, py, TILE_SIZE)) return;
  } else {
    const spriteName = OVERLAY_SPRITES[type];
    if (spriteName && useSprites && drawTileSprite(ctx, spriteName, px, py, TILE_SIZE)) return;
  }

  // Fallback: procedural rendering
  renderTile(ctx, type, px, py, TILE_SIZE, gridX, gridY);
}

/** Render name tag and status above a character */
export function renderNameTag(
  ctx: CanvasRenderingContext2D,
  name: string,
  state: string,
  px: number,
  py: number,
  accentColor: string
): void {
  const tagY = py - 18;

  const stateIcons: Record<string, string> = {
    idle: '',
    walking: '',
    typing: '',
    reading: '',
    thinking: '',
    done: '',
    error: '',
  };

  const displayText = `${stateIcons[state] || ''} ${name}`;

  ctx.font = 'bold 10px monospace';
  const metrics = ctx.measureText(displayText);
  const tagWidth = metrics.width + 8;
  const tagX = px + (TILE_SIZE - tagWidth) / 2;

  // Background pill
  ctx.fillStyle = 'rgba(15, 15, 35, 0.85)';
  ctx.beginPath();
  ctx.roundRect(tagX, tagY - 2, tagWidth, 14, 4);
  ctx.fill();

  // Border
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(tagX, tagY - 2, tagWidth, 14, 4);
  ctx.stroke();

  // Text
  ctx.fillStyle = '#F8FAFC';
  ctx.fillText(displayText, tagX + 4, tagY + 9);
}
