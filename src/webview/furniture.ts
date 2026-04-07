/**
 * Furniture catalog and placement registry.
 *
 * Phase 3: All existing furniture is 1x1. The catalog includes future
 * multi-tile pieces (desk_dual, bookshelf_tall, couch, conference_table)
 * whose infrastructure is ready but not yet placed.
 *
 * Z-sorting uses placements to interleave furniture with agents each frame.
 * Desk-chair pairing replaces the old getDeskPositions() from office.ts.
 */

import type { TileType } from './office';
import { getGrid, GRID_ROWS, GRID_COLS, FURNITURE_TYPES } from './office';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FurniturePiece {
  readonly id: string;
  readonly width: number;          // tiles
  readonly height: number;         // tiles
  readonly walkableMask: readonly (readonly boolean[])[]; // [row][col], true = walkable
  readonly sortY: number;          // which row is the "base" for Z-sort (0-indexed)
  readonly chairSlots: ReadonlyArray<{ dx: number; dy: number; facing: string }>;
}

export interface PlacedFurniture {
  readonly piece: FurniturePiece;
  readonly gridX: number;          // anchor (top-left)
  readonly gridY: number;
  readonly instanceId: string;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

const FURNITURE_CATALOG: Readonly<Record<string, FurniturePiece>> = {
  // Current 1x1 pieces (mapped from existing layout)
  desk_single: {
    id: 'desk_single', width: 1, height: 1,
    walkableMask: [[false]],
    sortY: 0,
    chairSlots: [{ dx: 0, dy: 1, facing: 'up' }],
  },
  chair: {
    id: 'chair', width: 1, height: 1,
    walkableMask: [[false]],
    sortY: 0,
    chairSlots: [],
  },
  plant: {
    id: 'plant', width: 1, height: 1,
    walkableMask: [[false]],
    sortY: 0,
    chairSlots: [],
  },
  server: {
    id: 'server', width: 1, height: 1,
    walkableMask: [[false]],
    sortY: 0,
    chairSlots: [],
  },
  bookshelf: {
    id: 'bookshelf', width: 1, height: 1,
    walkableMask: [[false]],
    sortY: 0,
    chairSlots: [],
  },
  watercooler: {
    id: 'watercooler', width: 1, height: 1,
    walkableMask: [[false]],
    sortY: 0,
    chairSlots: [],
  },
  lamp: {
    id: 'lamp', width: 1, height: 1,
    walkableMask: [[false]],
    sortY: 0,
    chairSlots: [],
  },

  // Future multi-tile pieces (not placed yet)
  desk_dual: {
    id: 'desk_dual', width: 2, height: 1,
    walkableMask: [[false, false]],
    sortY: 0,
    chairSlots: [{ dx: 0, dy: 1, facing: 'up' }, { dx: 1, dy: 1, facing: 'up' }],
  },
  bookshelf_tall: {
    id: 'bookshelf_tall', width: 1, height: 2,
    walkableMask: [[false], [false]],
    sortY: 1,
    chairSlots: [],
  },
  couch: {
    id: 'couch', width: 2, height: 1,
    walkableMask: [[false, false]],
    sortY: 0,
    chairSlots: [],
  },
  conference_table: {
    id: 'conference_table', width: 2, height: 1,
    walkableMask: [[false, false]],
    sortY: 0,
    chairSlots: [
      { dx: 0, dy: -1, facing: 'down' }, { dx: 1, dy: -1, facing: 'down' },
      { dx: 0, dy: 1, facing: 'up' },    { dx: 1, dy: 1, facing: 'up' },
    ],
  },
};

// Map layout tile types to catalog piece IDs
const TILE_TO_PIECE: Partial<Record<TileType, string>> = {
  desk:        'desk_single',
  chair:       'chair',
  plant:       'plant',
  server:      'server',
  bookshelf:   'bookshelf',
  watercooler: 'watercooler',
  lamp:        'lamp',
};

// ---------------------------------------------------------------------------
// Placement registry
// ---------------------------------------------------------------------------

let placements: readonly PlacedFurniture[] = [];
let initialized = false;

function ensureInitialized(): void {
  if (initialized) return;
  initialized = true;

  const grid = getGrid();
  const result: PlacedFurniture[] = [];
  let counter = 0;

  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      const tile = grid[y][x];
      if (!FURNITURE_TYPES.has(tile.type)) continue;

      const pieceId = TILE_TO_PIECE[tile.type];
      if (!pieceId) continue;

      const piece = FURNITURE_CATALOG[pieceId];
      if (!piece) continue;

      result.push({
        piece,
        gridX: x,
        gridY: y,
        instanceId: `${tile.type}_${counter++}`,
      });
    }
  }

  placements = result;
}

/** Place a new furniture piece at a grid position (for future multi-tile support) */
export function placeFurniture(
  piece: FurniturePiece,
  gridX: number,
  gridY: number,
): PlacedFurniture {
  const placement: PlacedFurniture = {
    piece,
    gridX,
    gridY,
    instanceId: `${piece.id}_${Date.now()}`,
  };
  placements = [...placements, placement];
  return placement;
}

/** Get all current furniture placements (lazy-initialized from grid) */
export function getFurniturePlacements(): readonly PlacedFurniture[] {
  ensureInitialized();
  return placements;
}

/** Get desk-chair pairs for agent seating (replaces office.ts getDeskPositions) */
export function getDeskChairPairs(): Array<{
  desk: { x: number; y: number };
  chair: { x: number; y: number };
}> {
  const grid = getGrid();
  const pairs: Array<{
    desk: { x: number; y: number };
    chair: { x: number; y: number };
  }> = [];

  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      if (grid[y][x].type === 'desk') {
        if (y + 1 < GRID_ROWS && grid[y + 1][x].type === 'chair') {
          pairs.push({
            desk: { x, y },
            chair: { x, y: y + 1 },
          });
        }
      }
    }
  }
  return pairs;
}

/** Reset placement cache (call if layout changes) */
export function resetFurniture(): void {
  placements = [];
  initialized = false;
}
