/**
 * Agent character state machine with sub-agent support.
 * Lifecycle: spawn at door -> walk to desk -> work -> (optionally spawn sub-agents)
 * Sub-agent departure: wave goodbye -> walk to door -> fade out -> remove
 * Parent shows "spawning" sparkle animation when creating sub-agents.
 */

import { findPath, getDirection } from './pathfinding';
import { getTileSize, GRID_COLS } from './office';
import { getDeskChairPairs } from './furniture';

export type AgentState =
  | 'idle' | 'walking' | 'typing' | 'reading' | 'thinking'
  | 'done' | 'error'
  | 'spawning'   // Parent: sparkle animation while sub-agents appear
  | 'waving'     // Sub-agent: wave goodbye before leaving
  | 'departing'  // Sub-agent: walking back to door
  | 'fading';    // Sub-agent: disappearing at door

export type Direction = 'down' | 'up' | 'left' | 'right';

export interface Agent {
  readonly id: string;
  readonly name: string;
  readonly variant: number;
  readonly model: string;
  readonly branch: string;
  readonly state: AgentState;
  readonly direction: Direction;
  readonly tileX: number;
  readonly tileY: number;
  readonly pixelX: number;
  readonly pixelY: number;
  readonly path: ReadonlyArray<{ x: number; y: number }>;
  readonly pathIndex: number;
  readonly animFrame: number;
  readonly animTimer: number;
  readonly deskX: number;
  readonly deskY: number;
  readonly chairX: number;
  readonly chairY: number;
  readonly taskSummary: string;
  readonly startedAt: number;
  readonly walkSpeed: number;
  readonly parentId: string | null;        // null if root agent
  readonly childIds: readonly string[];    // sub-agent IDs spawned by this agent
  readonly stateTimer: number;             // ticks spent in current timed state
  readonly pendingState: AgentState | null; // state to transition to after timed state
  readonly opacity: number;                // 0-1, used for fade out
}

const ANIM_SPEED = 8;
const WALK_PX_PER_FRAME = 16;
/** Spawn point: center of the hallway connecting both rooms */
const DOOR_TILE = { x: 10, y: 10 };
const WAVE_DURATION = 60;      // ~2 seconds at 30fps
const SPAWNING_DURATION = 45;  // ~1.5 seconds
const FADE_DURATION = 30;      // ~1 second

let deskAssignments: Map<string, number> = new Map();

/** Track parent-child relationships globally */
let parentChildMap: Map<string, string> = new Map(); // childId -> parentId

function getNextDeskIndex(): number {
  const desks = getDeskChairPairs();
  const used = new Set(deskAssignments.values());
  for (let i = 0; i < desks.length; i++) {
    if (!used.has(i)) return i;
  }
  return 0;
}

/** Create a new agent at the door tile */
export function createAgent(
  id: string,
  name: string,
  variant: number,
  model: string,
  branch: string,
  taskSummary: string,
  parentId?: string
): Agent {
  const deskIndex = getNextDeskIndex();
  deskAssignments.set(id, deskIndex);
  const desks = getDeskChairPairs();
  const desk = desks[deskIndex % desks.length];
  const tileSize = getTileSize();

  const path = findPath(DOOR_TILE, { x: desk.chair.x, y: desk.chair.y });

  if (parentId) {
    parentChildMap.set(id, parentId);
  }

  return {
    id,
    name,
    variant,
    model,
    branch,
    state: 'walking',
    direction: 'left',
    tileX: DOOR_TILE.x,
    tileY: DOOR_TILE.y,
    pixelX: DOOR_TILE.x * tileSize,
    pixelY: DOOR_TILE.y * tileSize,
    path,
    pathIndex: 0,
    animFrame: 0,
    animTimer: 0,
    deskX: desk.desk.x,
    deskY: desk.desk.y,
    chairX: desk.chair.x,
    chairY: desk.chair.y,
    taskSummary,
    startedAt: Date.now(),
    walkSpeed: WALK_PX_PER_FRAME,
    parentId: parentId || null,
    childIds: [],
    stateTimer: 0,
    pendingState: null,
    opacity: 1,
  };
}

/** Remove agent and free their desk */
export function removeAgent(id: string): void {
  deskAssignments.delete(id);
  parentChildMap.delete(id);
}

/** Add a child ID to a parent agent */
export function addChildToAgent(agent: Agent, childId: string): Agent {
  return {
    ...agent,
    childIds: [...agent.childIds, childId],
  };
}

/** Remove a child ID from a parent agent */
export function removeChildFromAgent(agent: Agent, childId: string): Agent {
  return {
    ...agent,
    childIds: agent.childIds.filter(id => id !== childId),
  };
}

/** Trigger spawning animation on parent when it creates sub-agents */
export function triggerSpawning(agent: Agent): Agent {
  return {
    ...agent,
    state: 'spawning',
    stateTimer: 0,
    pendingState: agent.state === 'spawning' ? 'thinking' : agent.state,
  };
}

/** Start the goodbye sequence: wave -> walk to door -> fade -> remove */
export function triggerDeparture(agent: Agent): Agent {
  return {
    ...agent,
    state: 'waving',
    stateTimer: 0,
    direction: 'down', // Face the "camera" while waving
  };
}

/** Update agent state based on new activity from transcript */
export function updateAgentActivity(agent: Agent, newState: AgentState, taskSummary?: string): Agent {
  // Don't interrupt departure sequence
  if (agent.state === 'waving' || agent.state === 'departing' || agent.state === 'fading') {
    return agent;
  }

  if (newState === agent.state && !taskSummary) return agent;

  // If agent was idle/done/error and gets new work, walk back to desk
  if ((agent.state === 'done' || agent.state === 'error' || agent.state === 'idle') &&
      (newState === 'typing' || newState === 'reading' || newState === 'thinking')) {
    if (agent.tileX !== agent.chairX || agent.tileY !== agent.chairY) {
      const path = findPath(
        { x: agent.tileX, y: agent.tileY },
        { x: agent.chairX, y: agent.chairY }
      );
      return {
        ...agent,
        state: 'walking',
        path,
        pathIndex: 0,
        taskSummary: taskSummary || agent.taskSummary,
      };
    }
  }

  return {
    ...agent,
    state: newState,
    stateTimer: 0,
    direction: newState === 'typing' ? 'up' : agent.direction,
    taskSummary: taskSummary || agent.taskSummary,
  };
}

/**
 * Tick the agent's animation and movement.
 * Returns { agent, shouldRemove } where shouldRemove indicates
 * the agent has fully faded and should be deleted.
 */
export function tickAgent(agent: Agent): { agent: Agent; shouldRemove: boolean } {
  const tileSize = getTileSize();
  let updated = { ...agent, animTimer: agent.animTimer + 1 };

  // Advance animation frame
  if (updated.animTimer >= ANIM_SPEED) {
    updated = { ...updated, animFrame: (updated.animFrame + 1) % 4, animTimer: 0 };
  }

  // Handle timed states
  if (updated.state === 'spawning') {
    const timer = updated.stateTimer + 1;
    if (timer >= SPAWNING_DURATION) {
      // Return to previous state
      return {
        agent: { ...updated, state: updated.pendingState || 'thinking', stateTimer: 0, pendingState: null },
        shouldRemove: false,
      };
    }
    return { agent: { ...updated, stateTimer: timer }, shouldRemove: false };
  }

  if (updated.state === 'waving') {
    const timer = updated.stateTimer + 1;
    if (timer >= WAVE_DURATION) {
      // Start walking to door
      const path = findPath(
        { x: updated.tileX, y: updated.tileY },
        DOOR_TILE
      );
      return {
        agent: { ...updated, state: 'departing', path, pathIndex: 0, stateTimer: 0 },
        shouldRemove: false,
      };
    }
    return { agent: { ...updated, stateTimer: timer }, shouldRemove: false };
  }

  if (updated.state === 'fading') {
    const timer = updated.stateTimer + 1;
    const newOpacity = Math.max(0, 1 - (timer / FADE_DURATION));
    if (timer >= FADE_DURATION) {
      return { agent: { ...updated, opacity: 0, stateTimer: timer }, shouldRemove: true };
    }
    return { agent: { ...updated, opacity: newOpacity, stateTimer: timer }, shouldRemove: false };
  }

  // Handle walking (both normal and departing)
  if ((updated.state === 'walking' || updated.state === 'departing') && updated.path.length > 0) {
    const target = updated.path[updated.pathIndex];
    if (!target) {
      if (updated.state === 'departing') {
        // Arrived at door: start fading
        return {
          agent: {
            ...updated,
            state: 'fading',
            path: [],
            pathIndex: 0,
            stateTimer: 0,
            tileX: DOOR_TILE.x,
            tileY: DOOR_TILE.y,
            pixelX: DOOR_TILE.x * tileSize,
            pixelY: DOOR_TILE.y * tileSize,
          },
          shouldRemove: false,
        };
      }
      // Normal walking: arrived at desk
      return {
        agent: {
          ...updated,
          state: 'idle',
          path: [],
          pathIndex: 0,
          tileX: updated.chairX,
          tileY: updated.chairY,
          pixelX: updated.chairX * tileSize,
          pixelY: updated.chairY * tileSize,
        },
        shouldRemove: false,
      };
    }

    const targetPx = target.x * tileSize;
    const targetPy = target.y * tileSize;
    let { pixelX, pixelY } = updated;
    const speed = updated.walkSpeed;

    if (pixelX < targetPx) pixelX = Math.min(pixelX + speed, targetPx);
    else if (pixelX > targetPx) pixelX = Math.max(pixelX - speed, targetPx);
    if (pixelY < targetPy) pixelY = Math.min(pixelY + speed, targetPy);
    else if (pixelY > targetPy) pixelY = Math.max(pixelY - speed, targetPy);

    const dir = getDirection({ x: updated.tileX, y: updated.tileY }, target);

    if (pixelX === targetPx && pixelY === targetPy) {
      const nextIndex = updated.pathIndex + 1;
      return {
        agent: { ...updated, pixelX, pixelY, tileX: target.x, tileY: target.y, pathIndex: nextIndex, direction: dir },
        shouldRemove: false,
      };
    }

    return { agent: { ...updated, pixelX, pixelY, direction: dir }, shouldRemove: false };
  }

  return { agent: updated, shouldRemove: false };
}

/** Get the parent ID for a given agent */
export function getParentId(agentId: string): string | null {
  return parentChildMap.get(agentId) || null;
}

/** Get all currently assigned desk indices */
export function getAssignedDesks(): Map<string, number> {
  return new Map(deskAssignments);
}

/** Reset all desk assignments */
export function resetDesks(): void {
  deskAssignments = new Map();
  parentChildMap = new Map();
}
