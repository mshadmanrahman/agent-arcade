/**
 * BFS pathfinding on the office tile grid.
 * Finds shortest walkable path between two tile positions.
 * Returns array of tile positions from start to end (inclusive).
 */

import { isWalkable, GRID_COLS, GRID_ROWS } from './office';

interface TilePos {
  x: number;
  y: number;
}

/** Cardinal directions: right, down, left, up */
const DIRS: readonly TilePos[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

function posKey(pos: TilePos): string {
  return `${pos.x},${pos.y}`;
}

/**
 * BFS from start to end on the walkable grid.
 * Returns the path as an array of tile positions (start excluded, end included).
 * Returns empty array if no path exists.
 */
export function findPath(start: TilePos, end: TilePos): TilePos[] {
  if (start.x === end.x && start.y === end.y) return [];
  if (!isWalkable(end.x, end.y)) {
    // Try to find nearest walkable tile to the target
    const nearest = findNearestWalkable(end);
    if (!nearest) return [];
    return findPath(start, nearest);
  }

  const visited = new Set<string>();
  const parent = new Map<string, TilePos>();
  const queue: TilePos[] = [start];
  visited.add(posKey(start));

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.x === end.x && current.y === end.y) {
      // Reconstruct path
      const path: TilePos[] = [];
      let node: TilePos | undefined = current;
      while (node && !(node.x === start.x && node.y === start.y)) {
        path.unshift({ x: node.x, y: node.y });
        node = parent.get(posKey(node));
      }
      return path;
    }

    for (const dir of DIRS) {
      const next: TilePos = { x: current.x + dir.x, y: current.y + dir.y };
      const key = posKey(next);

      if (!visited.has(key) && isWalkable(next.x, next.y)) {
        visited.add(key);
        parent.set(key, current);
        queue.push(next);
      }
    }
  }

  return []; // No path found
}

/** Find the nearest walkable tile to a target position */
function findNearestWalkable(target: TilePos): TilePos | null {
  // Spiral outward from target
  for (let radius = 1; radius < Math.max(GRID_COLS, GRID_ROWS); radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        const nx = target.x + dx;
        const ny = target.y + dy;
        if (isWalkable(nx, ny)) {
          return { x: nx, y: ny };
        }
      }
    }
  }
  return null;
}

/** Determine direction from one tile to the next */
export function getDirection(from: TilePos, to: TilePos): 'up' | 'down' | 'left' | 'right' {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left';
  }
  return dy > 0 ? 'down' : 'up';
}
