/**
 * Office tile map: defines the layout of the pixel art office.
 * Uses a 12x10 grid with walls, desks, plants, and a coffee station.
 * Each tile is 48x48 pixels (matching sprite render size).
 */

const TILE_SIZE = 48;

export type TileType = 'floor' | 'wall' | 'wall_top' | 'desk' | 'chair' | 'plant' | 'server' | 'coffee' | 'empty' | 'door';

export interface OfficeTile {
  type: TileType;
  walkable: boolean;
}

/** 10 rows x 12 cols office layout
 *  W = wall, T = wall_top, F = floor, D = desk, C = chair,
 *  P = plant, S = server, K = coffee, E = empty, R = door
 */
const LAYOUT_KEY: Record<string, TileType> = {
  'W': 'wall', 'T': 'wall_top', 'F': 'floor', 'D': 'desk',
  'C': 'chair', 'P': 'plant', 'S': 'server', 'K': 'coffee',
  'E': 'empty', 'R': 'door',
};

const OFFICE_LAYOUT: string[] = [
  'WWWWWWWWWWWW',
  'WPFFDFDFFSFW',
  'WFFCFCFFFFFW',
  'WFFFFFFFFFFF',
  'WFFDFDFFFFFK',
  'WFFCFCFFFFFW',
  'WFFFFFFFFFFF',
  'WFFDFDFFSPPW',
  'WFFCFCFFFFFR',
  'WWWWWWWWWWWW',
];

export const GRID_COLS = 12;
export const GRID_ROWS = 10;

export function getTileSize(): number {
  return TILE_SIZE;
}

export function getCanvasWidth(): number {
  return GRID_COLS * TILE_SIZE;
}

export function getCanvasHeight(): number {
  return GRID_ROWS * TILE_SIZE;
}

function parseTile(char: string): OfficeTile {
  const type = LAYOUT_KEY[char] || 'floor';
  const walkable = type === 'floor' || type === 'door';
  return { type, walkable };
}

let tileGrid: OfficeTile[][] | null = null;

export function getGrid(): OfficeTile[][] {
  if (tileGrid) return tileGrid;
  tileGrid = OFFICE_LAYOUT.map(row =>
    row.split('').map(parseTile)
  );
  return tileGrid;
}

export function isWalkable(x: number, y: number): boolean {
  if (x < 0 || x >= GRID_COLS || y < 0 || y >= GRID_ROWS) return false;
  return getGrid()[y][x].walkable;
}

/** Get all desk positions (where agents sit) */
export function getDeskPositions(): Array<{ desk: { x: number; y: number }; chair: { x: number; y: number } }> {
  const grid = getGrid();
  const desks: Array<{ desk: { x: number; y: number }; chair: { x: number; y: number } }> = [];

  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      if (grid[y][x].type === 'desk') {
        // Look for chair below the desk
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

/** Color palette: original pixel-agents dark theme (#1e1e2e base) */
const TILE_COLORS: Record<TileType, string> = {
  floor: '#2a2a3e',
  wall: '#1e1e2e',
  wall_top: '#252538',
  desk: '#6b5a2e',
  chair: '#3a3a52',
  plant: '#2d8a4e',
  server: '#3a4558',
  coffee: '#7a4a1e',
  empty: '#11111b',
  door: '#4a3e1e',
};

const TILE_HIGHLIGHTS: Record<string, string> = {
  floor: '#33334a',
  desk: '#8a7038',
  chair: '#4a4a62',
  server: '#4a5a70',
  coffee: '#8a5a28',
};

/** Render the office to a canvas context */
export function renderOffice(ctx: CanvasRenderingContext2D): void {
  const grid = getGrid();

  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      const tile = grid[y][x];
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;

      // Base tile color
      ctx.fillStyle = TILE_COLORS[tile.type];
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

      // Tile details
      switch (tile.type) {
        case 'floor':
          // Subtle grid lines
          ctx.strokeStyle = '#232338';
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
          // Occasional floor highlight speck
          if ((x + y) % 3 === 0) {
            ctx.fillStyle = TILE_HIGHLIGHTS['floor'];
            ctx.fillRect(px + 2, py + 2, 4, 4);
          }
          break;

        case 'wall':
          // Brick pattern
          ctx.fillStyle = '#252540';
          for (let by = 0; by < TILE_SIZE; by += 8) {
            const offset = (by / 8) % 2 === 0 ? 0 : 12;
            for (let bx = offset; bx < TILE_SIZE; bx += 24) {
              ctx.fillRect(px + bx, py + by, 22, 6);
            }
          }
          ctx.strokeStyle = '#141428';
          ctx.lineWidth = 1;
          ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
          break;

        case 'desk':
          // Desk surface with wood grain
          ctx.fillStyle = TILE_HIGHLIGHTS['desk'];
          ctx.fillRect(px + 2, py + 4, TILE_SIZE - 4, TILE_SIZE - 8);
          // Monitor
          ctx.fillStyle = '#1E293B';
          ctx.fillRect(px + 10, py + 8, 28, 20);
          ctx.fillStyle = '#38BDF8';
          ctx.fillRect(px + 12, py + 10, 24, 16);
          // Monitor stand
          ctx.fillStyle = '#64748B';
          ctx.fillRect(px + 20, py + 28, 8, 6);
          // Keyboard
          ctx.fillStyle = '#334155';
          ctx.fillRect(px + 8, py + 36, 32, 6);
          break;

        case 'chair':
          // Office chair (top-down view)
          ctx.fillStyle = TILE_HIGHLIGHTS['chair'];
          ctx.beginPath();
          ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, 14, 0, Math.PI * 2);
          ctx.fill();
          // Chair back
          ctx.fillStyle = '#3A3A5A';
          ctx.fillRect(px + 12, py + 4, 24, 10);
          break;

        case 'plant':
          // Pot
          ctx.fillStyle = '#92400E';
          ctx.fillRect(px + 14, py + 28, 20, 16);
          ctx.fillRect(px + 10, py + 26, 28, 4);
          // Leaves
          ctx.fillStyle = '#16A34A';
          ctx.beginPath();
          ctx.arc(px + 24, py + 18, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#22C55E';
          ctx.beginPath();
          ctx.arc(px + 20, py + 14, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(px + 30, py + 16, 7, 0, Math.PI * 2);
          ctx.fill();
          break;

        case 'server':
          // Server rack
          ctx.fillStyle = '#334155';
          ctx.fillRect(px + 6, py + 2, 36, 44);
          // Server lights
          for (let i = 0; i < 4; i++) {
            ctx.fillStyle = i % 2 === 0 ? '#22C55E' : '#3B82F6';
            ctx.fillRect(px + 10, py + 6 + i * 10, 4, 4);
            ctx.fillStyle = '#475569';
            ctx.fillRect(px + 18, py + 6 + i * 10, 20, 4);
          }
          break;

        case 'coffee':
          // Coffee machine
          ctx.fillStyle = '#57534E';
          ctx.fillRect(px + 8, py + 4, 32, 40);
          ctx.fillStyle = '#292524';
          ctx.fillRect(px + 12, py + 8, 24, 20);
          // Cup
          ctx.fillStyle = '#FAFAF9';
          ctx.fillRect(px + 18, py + 30, 12, 10);
          // Steam
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.fillRect(px + 22, py + 24, 2, 6);
          ctx.fillRect(px + 26, py + 22, 2, 8);
          break;

        case 'door':
          // Floor with door mat
          ctx.fillStyle = '#5B4A1E';
          ctx.fillRect(px + 4, py + 4, TILE_SIZE - 8, TILE_SIZE - 8);
          ctx.fillStyle = '#7C6423';
          ctx.fillRect(px + 8, py + 8, TILE_SIZE - 16, TILE_SIZE - 16);
          break;
      }
    }
  }
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

  // State emoji
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
