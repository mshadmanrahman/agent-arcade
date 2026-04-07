/**
 * Wall autotiling system using 4-bit neighbor bitmask.
 *
 * Scans cardinal neighbors of each wall tile to determine how it
 * connects to adjacent walls. The resulting bitmask (0-15) selects
 * the correct wall piece: trim/shadows only appear on edges that
 * face non-wall tiles (rooms, hallways, doors).
 *
 * Bitmask bits: N=1, E=2, S=4, W=8
 *
 * Examples:
 *   mask 0  = isolated pillar (trim on all edges)
 *   mask 5  = vertical wall (N+S connected, trim on E/W)
 *   mask 10 = horizontal wall (E+W connected, trim on N/S)
 *   mask 15 = fully surrounded (no trim)
 */

import type { TileType, OfficeTile } from './office';

export const MASK_N = 1;
export const MASK_E = 2;
export const MASK_S = 4;
export const MASK_W = 8;

/** Tile types that count as "wall-like" for bitmask neighbor checks */
function isWallLike(type: TileType): boolean {
  return (
    type === 'wall' ||
    type === 'wall_top' ||
    type === 'window' ||
    type === 'whiteboard' ||
    type === 'empty' ||
    type === 'coffee'
  );
}

/** Build the 4-bit wall neighbor mask for a given cell */
export function buildWallMask(
  col: number,
  row: number,
  grid: readonly (readonly OfficeTile[])[],
  rows: number,
  cols: number
): number {
  let mask = 0;
  if (row > 0 && isWallLike(grid[row - 1][col].type)) mask |= MASK_N;
  if (col < cols - 1 && isWallLike(grid[row][col + 1].type)) mask |= MASK_E;
  if (row < rows - 1 && isWallLike(grid[row + 1][col].type)) mask |= MASK_S;
  if (col > 0 && isWallLike(grid[row][col - 1].type)) mask |= MASK_W;
  return mask;
}

// ---------------------------------------------------------------------------
// Palette (shared with tileRenderer but scoped here for wall specifics)
// ---------------------------------------------------------------------------
const PAL = {
  wallBase:    '#3A4050',   // dark navy base
  wallBrickA:  '#424858',   // subtle brick variation
  wallBrickB:  '#4A5060',   // subtle brick variation
  wallMortar:  '#303848',   // gaps between bricks
  wallTrim:    '#505868',   // baseboard trim
  wallShadow:  '#282E3C',   // darkest shadow
  wallEdge:    '#384048',   // edge facing room
  wallCorner:  '#282E3C',   // corner accent
  wallAccent:  '#485060',   // trim highlight
  wallInner:   '#B8B0A8',   // floor color showing through (for outline style)
} as const;

const PX = 3;

/** Draw a rectangle in 16x16 virtual pixel coords */
function vRect(
  ctx: CanvasRenderingContext2D,
  bx: number, by: number,
  vx: number, vy: number,
  vw: number, vh: number,
  color: string
): void {
  ctx.fillStyle = color;
  ctx.fillRect(bx + vx * PX, by + vy * PX, vw * PX, vh * PX);
}

/** Deterministic pseudo-random from grid position */
function tileSeed(gx: number, gy: number): number {
  return ((gx * 7 + gy * 13 + gx * gy * 3) & 0xffff) % 17;
}

/**
 * Render a wall tile using outline style (LimeZu Modern Office look).
 *
 * Instead of solid brick fills, walls are rendered as dark outlines
 * around room boundaries. The interior of wall tiles that face rooms
 * shows the wall "face" (a short height band), while wall tiles fully
 * surrounded by other walls show the wall top (floor-colored).
 */
export function renderAutoWall(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  mask: number,
  gx: number,
  gy: number
): void {
  // Start with floor color (wall "top" in top-down view)
  vRect(ctx, px, py, 0, 0, 16, 16, PAL.wallInner);

  const hasN = (mask & MASK_N) !== 0;
  const hasE = (mask & MASK_E) !== 0;
  const hasS = (mask & MASK_S) !== 0;
  const hasW = (mask & MASK_W) !== 0;

  // Draw dark outline borders on edges facing non-wall tiles
  // These create the room boundary lines

  // South edge (faces room below): thick wall face with baseboard
  if (!hasS) {
    // Wall face (the visible "height" of the wall from top-down)
    vRect(ctx, px, py, 0, 10, 16, 6, PAL.wallBase);
    // Baseboard trim at very bottom
    vRect(ctx, px, py, 0, 14, 16, 2, PAL.wallTrim);
    // Top edge of wall face (highlight)
    vRect(ctx, px, py, 0, 10, 16, 1, PAL.wallBrickA);
    // Subtle brick detail on face
    vRect(ctx, px, py, 2, 11, 4, 2, PAL.wallBrickB);
    vRect(ctx, px, py, 8, 12, 5, 2, PAL.wallBrickB);
  }

  // North edge (faces room above): thin top outline
  if (!hasN) {
    vRect(ctx, px, py, 0, 0, 16, 2, PAL.wallBase);
    vRect(ctx, px, py, 0, 0, 16, 1, PAL.wallShadow);
  }

  // West edge (faces room to the left): thin side outline
  if (!hasW) {
    vRect(ctx, px, py, 0, 0, 2, 16, PAL.wallBase);
    vRect(ctx, px, py, 0, 0, 1, 16, PAL.wallShadow);
  }

  // East edge (faces room to the right): thin side outline
  if (!hasE) {
    vRect(ctx, px, py, 14, 0, 2, 16, PAL.wallBase);
    vRect(ctx, px, py, 15, 0, 1, 16, PAL.wallEdge);
  }

  // Corner fills: where two outlines meet, fill the corner solidly
  // Outer corners (two exposed edges meet)
  if (!hasN && !hasW) {
    vRect(ctx, px, py, 0, 0, 3, 3, PAL.wallShadow);
  }
  if (!hasN && !hasE) {
    vRect(ctx, px, py, 13, 0, 3, 3, PAL.wallShadow);
  }
  if (!hasS && !hasW) {
    vRect(ctx, px, py, 0, 10, 3, 6, PAL.wallShadow);
  }
  if (!hasS && !hasE) {
    vRect(ctx, px, py, 13, 10, 3, 6, PAL.wallShadow);
  }

  // Fully enclosed walls (all 4 sides connected): show as wall top
  if (hasN && hasE && hasS && hasW) {
    // Just the floor-colored top with a subtle cross-hatch
    vRect(ctx, px, py, 0, 0, 16, 16, PAL.wallInner);
    // Subtle tile outline to distinguish from actual floor
    vRect(ctx, px, py, 0, 0, 16, 1, '#A8A098');
    vRect(ctx, px, py, 0, 0, 1, 16, '#A8A098');
  }
}
