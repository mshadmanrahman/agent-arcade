/**
 * Main game loop and canvas renderer.
 * Runs at ~30fps, renders office + all agent characters.
 * Handles: click detection, parent-child connections, opacity for fading agents.
 */

import { renderOffice, renderNameTag, getCanvasWidth, getCanvasHeight, getTileSize } from './office';
import { getSpriteCanvas, getSpriteWidth, getSpriteHeight, getVariantAccent } from './sprites';
import {
  Agent, tickAgent, createAgent, removeAgent, updateAgentActivity,
  addChildToAgent, removeChildFromAgent, triggerSpawning, triggerDeparture,
} from './agents';

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let officeCanvas: HTMLCanvasElement;
let agents: Map<string, Agent> = new Map();
let selectedAgentId: string | null = null;
let animFrameId: number = 0;
let lastFrameTime: number = 0;
const TARGET_FPS = 30;
const FRAME_INTERVAL = 1000 / TARGET_FPS;

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

let vscode: ReturnType<typeof acquireVsCodeApi>;

export function init(): void {
  vscode = acquireVsCodeApi();

  canvas = document.getElementById('office-canvas') as HTMLCanvasElement;
  ctx = canvas.getContext('2d')!;

  canvas.width = getCanvasWidth();
  canvas.height = getCanvasHeight();

  officeCanvas = document.createElement('canvas');
  officeCanvas.width = canvas.width;
  officeCanvas.height = canvas.height;
  const officeCtx = officeCanvas.getContext('2d')!;
  renderOffice(officeCtx);

  canvas.addEventListener('click', handleClick);
  window.addEventListener('message', handleMessage);

  // "+ Agent" button and modal
  setupSpawnUI();

  vscode.postMessage({ type: 'ready' });

  lastFrameTime = performance.now();
  animFrameId = requestAnimationFrame(gameLoop);
}

function setupSpawnUI(): void {
  const addBtn = document.getElementById('add-agent-btn');
  const overlay = document.getElementById('prompt-overlay');
  const promptInput = document.getElementById('agent-prompt') as HTMLTextAreaElement;
  const cancelBtn = document.getElementById('btn-cancel');
  const spawnEmptyBtn = document.getElementById('btn-spawn-empty');
  const spawnBtn = document.getElementById('btn-spawn');

  if (!addBtn || !overlay || !promptInput || !cancelBtn || !spawnEmptyBtn || !spawnBtn) return;

  addBtn.addEventListener('click', () => {
    overlay.classList.add('visible');
    promptInput.value = '';
    promptInput.focus();
  });

  cancelBtn.addEventListener('click', () => {
    overlay.classList.remove('visible');
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('visible');
  });

  spawnEmptyBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'spawnAgent', payload: { prompt: '' } });
    overlay.classList.remove('visible');
  });

  spawnBtn.addEventListener('click', () => {
    const prompt = promptInput.value.trim();
    vscode.postMessage({ type: 'spawnAgent', payload: { prompt } });
    overlay.classList.remove('visible');
  });

  // Enter key in textarea spawns (Shift+Enter for newline)
  promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const prompt = promptInput.value.trim();
      vscode.postMessage({ type: 'spawnAgent', payload: { prompt } });
      overlay.classList.remove('visible');
    }
    if (e.key === 'Escape') {
      overlay.classList.remove('visible');
    }
  });
}

function gameLoop(timestamp: number): void {
  animFrameId = requestAnimationFrame(gameLoop);

  const elapsed = timestamp - lastFrameTime;
  if (elapsed < FRAME_INTERVAL) return;
  lastFrameTime = timestamp - (elapsed % FRAME_INTERVAL);

  update();
  render();
}

function update(): void {
  const updated = new Map<string, Agent>();
  const toRemove: string[] = [];

  agents.forEach((agent, id) => {
    const result = tickAgent(agent);
    if (result.shouldRemove) {
      toRemove.push(id);
    } else {
      updated.set(id, result.agent);
    }
  });

  // Clean up fully faded agents
  for (const id of toRemove) {
    const agent = agents.get(id);
    removeAgent(id);

    // Remove child reference from parent
    if (agent && agent.parentId) {
      const parent = updated.get(agent.parentId);
      if (parent) {
        updated.set(agent.parentId, removeChildFromAgent(parent, id));
      }
    }

    if (selectedAgentId === id) selectedAgentId = null;

    // Notify extension
    vscode.postMessage({ type: 'agentDeparted', payload: { id } });
  }

  agents = updated;

  // Update agent count display
  const countEl = document.getElementById('agent-count');
  if (countEl) {
    const count = agents.size;
    countEl.textContent = `${count} agent${count !== 1 ? 's' : ''}`;
  }
}

function render(): void {
  ctx.drawImage(officeCanvas, 0, 0);

  const tileSize = getTileSize();
  const spriteW = getSpriteWidth();
  const spriteH = getSpriteHeight();

  // Sort agents by Y for correct overlap (feet position)
  const sortedAgents = Array.from(agents.values()).sort((a, b) => a.pixelY - b.pixelY);

  // Draw parent-child connection lines first (behind characters)
  for (const agent of sortedAgents) {
    if (agent.parentId) {
      const parent = agents.get(agent.parentId);
      if (parent) {
        drawConnectionLine(parent, agent);
      }
    }
  }

  // Draw each character
  for (const agent of sortedAgents) {
    ctx.save();

    // Apply opacity for fading agents
    if (agent.opacity < 1) {
      ctx.globalAlpha = agent.opacity;
    }

    const spriteCanvas = getSpriteCanvas(
      agent.variant,
      agent.state,
      agent.direction,
      agent.animFrame
    );

    const bounceY = agent.state === 'idle' ? Math.sin(Date.now() / 400) * 2
      : agent.state === 'waving' ? Math.sin(Date.now() / 200) * 1.5
      : 0;

    // Character feet are at tile position; sprite extends upward
    // Center horizontally within tile, align bottom of sprite to bottom of tile
    const drawX = agent.pixelX + (tileSize - spriteW) / 2;
    const drawY = agent.pixelY + tileSize - spriteH + bounceY;

    // Sitting offset: shift down 6px when typing/reading at desk
    const sittingOffset = (agent.state === 'typing' || agent.state === 'reading') ? 6 : 0;

    ctx.drawImage(spriteCanvas, drawX, drawY + sittingOffset);

    // Name tag above character head
    const accent = getVariantAccent(agent.variant);
    const displayName = agent.parentId ? `  ${agent.name}` : agent.name;
    renderNameTag(ctx, displayName, agent.state, agent.pixelX, drawY - 4 + bounceY, accent);

    // Sub-agent count badge on parent
    if (agent.childIds.length > 0) {
      renderSubAgentBadge(ctx, agent.childIds.length, agent.pixelX + tileSize - 8, drawY - 8);
    }

    // Selection highlight around the tile
    if (agent.id === selectedAgentId) {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(agent.pixelX + 2, agent.pixelY + 2, tileSize - 4, tileSize - 4);
      ctx.setLineDash([]);
    }

    ctx.restore();
  }

  // Info panel
  if (selectedAgentId) {
    const agent = agents.get(selectedAgentId);
    if (agent) renderInfoPanel(agent);
  }
}

/** Draw a dashed line connecting parent to child agent */
function drawConnectionLine(parent: Agent, child: Agent): void {
  const tileSize = getTileSize();
  const pCenterX = parent.pixelX + tileSize / 2;
  const pCenterY = parent.pixelY + tileSize / 2;
  const cCenterX = child.pixelX + tileSize / 2;
  const cCenterY = child.pixelY + tileSize / 2;

  const accent = getVariantAccent(parent.variant);

  ctx.save();
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.3 * (child.opacity || 1);
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 5]);

  ctx.beginPath();
  ctx.moveTo(pCenterX, pCenterY);
  ctx.lineTo(cCenterX, cCenterY);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.restore();
}

/** Render a small badge showing number of active sub-agents */
function renderSubAgentBadge(ctx: CanvasRenderingContext2D, count: number, x: number, y: number): void {
  const radius = 8;
  ctx.fillStyle = '#7C3AED';
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(count), x, y);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

function renderInfoPanel(agent: Agent): void {
  const panelW = 260;
  const panelH = agent.childIds.length > 0 ? 150 : 120;
  const panelX = canvas.width - panelW - 8;
  const panelY = 8;

  ctx.fillStyle = 'rgba(15, 15, 35, 0.92)';
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelW, panelH, 8);
  ctx.fill();

  const accent = getVariantAccent(agent.variant);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelW, panelH, 8);
  ctx.stroke();

  ctx.fillStyle = '#F8FAFC';
  ctx.font = 'bold 12px monospace';
  const roleLabel = agent.parentId ? ' (sub-agent)' : '';
  ctx.fillText(agent.name + roleLabel, panelX + 12, panelY + 22);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '10px monospace';
  ctx.fillText(`Model: ${agent.model}`, panelX + 12, panelY + 40);
  ctx.fillText(`Branch: ${agent.branch}`, panelX + 12, panelY + 54);
  ctx.fillText(`State: ${agent.state}`, panelX + 12, panelY + 68);

  ctx.fillStyle = '#CBD5E1';
  const summary = agent.taskSummary.length > 32
    ? agent.taskSummary.slice(0, 32) + '...'
    : agent.taskSummary;
  ctx.fillText(`Task: ${summary}`, panelX + 12, panelY + 86);

  const elapsed = Math.floor((Date.now() - agent.startedAt) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  ctx.fillText(`Time: ${mins}m ${secs}s`, panelX + 12, panelY + 104);

  // Show sub-agent info
  if (agent.childIds.length > 0) {
    ctx.fillStyle = '#A78BFA';
    ctx.fillText(`Sub-agents: ${agent.childIds.length} active`, panelX + 12, panelY + 122);

    // List child names
    ctx.fillStyle = '#94A3B8';
    const childNames = agent.childIds
      .map(id => agents.get(id)?.name || id.slice(0, 8))
      .join(', ');
    const truncNames = childNames.length > 30 ? childNames.slice(0, 30) + '...' : childNames;
    ctx.fillText(`  ${truncNames}`, panelX + 12, panelY + 138);
  }

  if (agent.parentId) {
    const parent = agents.get(agent.parentId);
    ctx.fillStyle = '#60A5FA';
    ctx.fillText(`Parent: ${parent?.name || agent.parentId.slice(0, 8)}`, panelX + 12, panelY + 104 + 18);
  }
}

function handleClick(event: MouseEvent): void {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const clickX = (event.clientX - rect.left) * scaleX;
  const clickY = (event.clientY - rect.top) * scaleY;

  const tileSize = getTileSize();
  const spriteH = getSpriteHeight();
  let clicked = false;

  agents.forEach((agent) => {
    // Hitbox covers the full sprite height (extends above the tile)
    const hitTop = agent.pixelY + tileSize - spriteH;
    if (
      clickX >= agent.pixelX &&
      clickX <= agent.pixelX + tileSize &&
      clickY >= hitTop &&
      clickY <= agent.pixelY + tileSize
    ) {
      selectedAgentId = selectedAgentId === agent.id ? null : agent.id;
      clicked = true;
      vscode.postMessage({ type: 'agentClicked', payload: { id: agent.id, name: agent.name } });
    }
  });

  if (!clicked) selectedAgentId = null;
}

function handleMessage(event: MessageEvent): void {
  const msg = event.data;
  switch (msg.type) {
    case 'agentAdd': {
      const a = msg.payload;
      const agent = createAgent(a.id, a.name, a.variant, a.model, a.branch, a.taskSummary, a.parentId);
      agents.set(a.id, agent);

      // If this is a sub-agent, update the parent
      if (a.parentId) {
        const parent = agents.get(a.parentId);
        if (parent) {
          agents.set(a.parentId, addChildToAgent(triggerSpawning(parent), a.id));
        }
      }
      break;
    }
    case 'agentUpdate': {
      const { id, state, taskSummary } = msg.payload;
      const existing = agents.get(id);
      if (existing) {
        agents.set(id, updateAgentActivity(existing, state, taskSummary));
      }
      break;
    }
    case 'agentRemove': {
      const { id } = msg.payload;
      const existing = agents.get(id);
      if (existing) {
        // Start goodbye sequence instead of instant removal
        agents.set(id, triggerDeparture(existing));
      }
      break;
    }
    case 'agentDepartSubAgents': {
      // Tell all sub-agents of a parent to wave goodbye
      const { parentId } = msg.payload;
      const parent = agents.get(parentId);
      if (parent) {
        for (const childId of parent.childIds) {
          const child = agents.get(childId);
          if (child && child.state !== 'waving' && child.state !== 'departing' && child.state !== 'fading') {
            agents.set(childId, triggerDeparture(child));
          }
        }
      }
      break;
    }
  }
}

// Auto-init when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
