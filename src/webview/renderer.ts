/**
 * Main game loop and canvas renderer.
 * Runs at ~30fps, renders office + all agent characters.
 * Handles: click detection, zoom, HTML agent panel, parent-child connections.
 */

import { renderOffice, renderNameTag, renderFurnitureTile, getCanvasWidth, getCanvasHeight, getTileSize, getGrid } from './office';
import { getSpriteCanvas, getSpriteWidth, getSpriteHeight, getVariantAccent } from './sprites';
import { renderChairOverlay } from './tileRenderer';
import { getFurniturePlacements } from './furniture';
import type { TileType } from './office';
import {
  Agent, tickAgent, createAgent, removeAgent, updateAgentActivity,
  addChildToAgent, removeChildFromAgent, triggerSpawning, triggerDeparture,
} from './agents';

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let officeCanvas: HTMLCanvasElement;
let agents: Map<string, Agent> = new Map();
let selectedAgentId: string | null = null;
let hoveredAgentId: string | null = null;
let animFrameId: number = 0;
let lastFrameTime: number = 0;
const TARGET_FPS = 30;
const FRAME_INTERVAL = 1000 / TARGET_FPS;

// Zoom state
let zoomLevel: number = 1.0;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3.0;
const ZOOM_STEP = 0.25;

// ---------------------------------------------------------------------------
// Z-sorted rendering types + caches
// ---------------------------------------------------------------------------

type RenderEntity =
  | { kind: 'agent'; agent: Agent; sortKey: number }
  | { kind: 'furniture'; gridX: number; gridY: number; tileType: TileType; sortKey: number };

/** Cached furniture entity list (grid is static, computed once) */
let cachedFurnitureEntities: RenderEntity[] | null = null;

function getFurnitureEntities(): RenderEntity[] {
  if (cachedFurnitureEntities) return cachedFurnitureEntities;
  const tileSize = getTileSize();
  const grid = getGrid();
  cachedFurnitureEntities = getFurniturePlacements().map(p => ({
    kind: 'furniture' as const,
    gridX: p.gridX,
    gridY: p.gridY,
    tileType: grid[p.gridY][p.gridX].type,
    sortKey: (p.gridY + p.piece.sortY + 1) * tileSize,
  }));
  return cachedFurnitureEntities;
}

/** Lazily-cached 48x48 chair overlay canvas (armrests + front cushion) */
let chairOverlayCanvas: HTMLCanvasElement | null = null;

function getChairOverlayCanvas(): HTMLCanvasElement {
  if (chairOverlayCanvas) return chairOverlayCanvas;
  chairOverlayCanvas = document.createElement('canvas');
  chairOverlayCanvas.width = 48;
  chairOverlayCanvas.height = 48;
  const overlayCtx = chairOverlayCanvas.getContext('2d')!;
  renderChairOverlay(overlayCtx, 0, 0);
  return chairOverlayCanvas;
}

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

let vscode: ReturnType<typeof acquireVsCodeApi>;

export function init(): void {
  vscode = acquireVsCodeApi();

  // 2D pixel office canvas (primary renderer)
  canvas = document.getElementById('office-canvas') as HTMLCanvasElement;
  if (canvas) {
    ctx = canvas.getContext('2d')!;
    const logicalW = getCanvasWidth();
    const logicalH = getCanvasHeight();
    canvas.width = logicalW;
    canvas.height = logicalH;

    // Let CSS handle scaling to fill container (remove fixed pixel style)
    // The canvas element uses max-width/max-height: 100% + object-fit: contain

    officeCanvas = document.createElement('canvas');
    officeCanvas.width = canvas.width;
    officeCanvas.height = canvas.height;
    const officeCtx = officeCanvas.getContext('2d')!;
    renderOffice(officeCtx);

    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', () => {
      hoveredAgentId = null;
      hideHoverTooltip();
    });
  }

  window.addEventListener('message', handleMessage);

  // UI setup
  setupSpawnUI();
  setupZoomUI();
  setupAgentPanel();

  vscode.postMessage({ type: 'ready' });

  lastFrameTime = performance.now();
  animFrameId = requestAnimationFrame(gameLoop);
}

// ---------------------------------------------------------------------------
// Spawn modal
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Zoom controls
// ---------------------------------------------------------------------------

function setupZoomUI(): void {
  const zoomIn = document.getElementById('zoom-in');
  const zoomOut = document.getElementById('zoom-out');

  if (zoomIn) zoomIn.addEventListener('click', () => setZoom(zoomLevel + ZOOM_STEP));
  if (zoomOut) zoomOut.addEventListener('click', () => setZoom(zoomLevel - ZOOM_STEP));
}

function updateZoomLabel(): void {
  const label = document.getElementById('zoom-label');
  if (label) {
    label.textContent = `${Math.round(zoomLevel * 100)}%`;
  }
}

function setZoom(level: number): void {
  zoomLevel = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, level));
  if (canvas) {
    canvas.style.transform = `scale(${zoomLevel})`;
    canvas.style.transformOrigin = 'center center';
  }
  updateZoomLabel();
}

// ---------------------------------------------------------------------------
// Agent detail panel (HTML)
// ---------------------------------------------------------------------------

function setupAgentPanel(): void {
  // Panel is now fully dynamic (rebuilt in showAgentPanel), no static setup needed
}

function showAgentPanel(agent: Agent): void {
  const panel = document.getElementById('agent-panel');
  if (!panel) return;

  const elapsed = Math.floor((Date.now() - agent.startedAt) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const statusColor = getStatusColor(agent.state);

  // Calculate pixel bar widths (session time maxes at 30 min for HP, tokens at 100k for MP)
  const hpPercent = Math.min(100, (elapsed / 1800) * 100);
  const xpPercent = Math.min(100, (agent.childIds.length + 1) * 20);

  const roleLabel = agent.parentId ? ' [SUB]' : '';
  const stateIcon = getStateIcon(agent.state);

  panel.innerHTML = `
    <div class="dossier">
      <div class="dossier-header">
        <div class="dossier-title-row">
          <span class="dossier-name">${agent.name}${roleLabel}</span>
          <button class="dossier-close" id="panel-close">&times;</button>
        </div>
        <div class="dossier-subtitle">
          <span class="dossier-dot" style="background:${statusColor}"></span>
          <span>${stateIcon} ${agent.state.toUpperCase()}</span>
          <span class="dossier-sep">|</span>
          <span>${agent.model}</span>
        </div>
      </div>

      <div class="dossier-bars">
        <div class="bar-row">
          <span class="bar-label">HP</span>
          <div class="bar-track">
            <div class="bar-fill bar-hp" style="width:${hpPercent}%"></div>
          </div>
          <span class="bar-value">${mins}m ${secs}s</span>
        </div>
        <div class="bar-row">
          <span class="bar-label">MP</span>
          <div class="bar-track">
            <div class="bar-fill bar-mp" style="width:50%"></div>
          </div>
          <span class="bar-value">tokens</span>
        </div>
        <div class="bar-row">
          <span class="bar-label">XP</span>
          <div class="bar-track">
            <div class="bar-fill bar-xp" style="width:${xpPercent}%"></div>
          </div>
          <span class="bar-value">${agent.childIds.length} spawn</span>
        </div>
      </div>

      <div class="dossier-section">
        <div class="dossier-section-title">STATS</div>
        <div class="dossier-stats">
          <div class="stat-item"><span class="stat-key">Branch</span><span class="stat-val">${agent.branch || 'main'}</span></div>
          <div class="stat-item"><span class="stat-key">Desk</span><span class="stat-val">${agent.deskX},${agent.deskY}</span></div>
          <div class="stat-item"><span class="stat-key">Sub-agents</span><span class="stat-val">${agent.childIds.length}</span></div>
          <div class="stat-item"><span class="stat-key">Direction</span><span class="stat-val">${agent.direction}</span></div>
        </div>
      </div>

      <div class="dossier-section">
        <div class="dossier-section-title">QUEST LOG</div>
        <div class="dossier-quest">${agent.taskSummary || 'Awaiting orders...'}</div>
      </div>

      <div class="dossier-section">
        <div class="dossier-section-title">ACTIVITY</div>
        <div class="dossier-sparkline" id="dossier-sparkline"></div>
      </div>

      <div class="dossier-actions">
        <button class="btn-end-agent" id="btn-end-agent">[ END QUEST ]</button>
      </div>
    </div>
  `;

  // Re-attach event handlers
  const closeBtn = document.getElementById('panel-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      selectedAgentId = null;
      hideAgentPanel();
    });
  }
  const endBtn = document.getElementById('btn-end-agent');
  if (endBtn) {
    endBtn.addEventListener('click', () => {
      if (selectedAgentId) {
        const id = selectedAgentId;
        agents.delete(id);
        removeAgent(id);
        vscode.postMessage({ type: 'killAgent', payload: { id } });
        vscode.postMessage({ type: 'agentDeparted', payload: { id } });
        selectedAgentId = null;
        hideAgentPanel();
      }
    });
  }

  panel.classList.add('visible');
}

function getStateIcon(state: string): string {
  switch (state) {
    case 'typing': return '>';
    case 'reading': return '*';
    case 'thinking': return '~';
    case 'walking': return '^';
    case 'done': return '+';
    case 'error': return '!';
    case 'spawning': return '@';
    case 'waving': return '/';
    default: return '-';
  }
}

function hideAgentPanel(): void {
  const panel = document.getElementById('agent-panel');
  if (panel) panel.classList.remove('visible');
}

// ---------------------------------------------------------------------------
// Game loop
// ---------------------------------------------------------------------------

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

  for (const id of toRemove) {
    const agent = agents.get(id);
    removeAgent(id);

    if (agent && agent.parentId) {
      const parent = updated.get(agent.parentId);
      if (parent) {
        updated.set(agent.parentId, removeChildFromAgent(parent, id));
      }
    }

    if (selectedAgentId === id) {
      selectedAgentId = null;
      hideAgentPanel();
    }

    vscode.postMessage({ type: 'agentDeparted', payload: { id } });
  }

  agents = updated;

  // Update agent count
  const countEl = document.getElementById('agent-count');
  if (countEl) {
    const count = agents.size;
    countEl.textContent = `${count} agent${count !== 1 ? 's' : ''}`;
  }

  // Update top status bar tabs
  updateAgentStatusBar();

  // Update panel if selected agent exists
  if (selectedAgentId) {
    const agent = agents.get(selectedAgentId);
    if (agent) showAgentPanel(agent);
    else hideAgentPanel();
  }
}

function render(): void {
  // Layer 0: baked background (floors, walls, rugs, ambient effects; NO furniture)
  ctx.drawImage(officeCanvas, 0, 0);

  const tileSize = getTileSize();
  const spriteW = getSpriteWidth();
  const spriteH = getSpriteHeight();

  // Layer 1: parent-child connection lines (drawn before everything else)
  const agentList = Array.from(agents.values());
  for (const agent of agentList) {
    if (agent.parentId) {
      const parent = agents.get(agent.parentId);
      if (parent) {
        drawConnectionLine(parent, agent);
      }
    }
  }

  // Layer 2: Z-sorted furniture + agents
  const entities: RenderEntity[] = [
    ...getFurnitureEntities(),
    ...agentList.map(a => ({
      kind: 'agent' as const,
      agent: a,
      sortKey: a.pixelY + tileSize,
    })),
  ];

  // Sort by bottom-edge Y; furniture renders before agents at same Y
  entities.sort((a, b) => {
    if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
    if (a.kind === 'furniture' && b.kind === 'agent') return -1;
    if (a.kind === 'agent' && b.kind === 'furniture') return 1;
    return 0;
  });

  for (const entity of entities) {
    if (entity.kind === 'furniture') {
      renderFurnitureTile(
        ctx,
        entity.tileType,
        entity.gridX * tileSize,
        entity.gridY * tileSize,
        entity.gridX,
        entity.gridY,
      );
      continue;
    }

    // Agent rendering
    const agent = entity.agent;
    ctx.save();

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

    const drawX = agent.pixelX + (tileSize - spriteW) / 2;
    const drawY = agent.pixelY + tileSize - spriteH + bounceY;

    // Sitting offset: 18px makes characters visibly sink into chairs
    const isSitting = agent.state === 'typing' || agent.state === 'reading';
    const sittingOffset = isSitting ? 18 : 0;

    ctx.drawImage(spriteCanvas, drawX, drawY + sittingOffset);

    // Chair overlay: armrests + front cushion drawn OVER the seated agent
    if (isSitting) {
      ctx.drawImage(getChairOverlayCanvas(), agent.pixelX, agent.pixelY);
    }

    // Name tag
    const accent = getVariantAccent(agent.variant);
    const displayName = agent.parentId ? `  ${agent.name}` : agent.name;
    renderNameTag(ctx, displayName, agent.state, agent.pixelX, drawY - 4 + bounceY, accent);

    // Speech bubble with current task (only when at desk)
    const isAtDesk = agent.state === 'typing' || agent.state === 'reading' || agent.state === 'thinking';
    if (isAtDesk && agent.taskSummary) {
      renderSpeechBubble(ctx, agent.taskSummary, agent.pixelX, drawY - 26 + bounceY, tileSize);
    }

    // Sub-agent count badge
    if (agent.childIds.length > 0) {
      renderSubAgentBadge(ctx, agent.childIds.length, agent.pixelX + tileSize - 8, drawY - 8);
    }

    // Selection highlight
    if (agent.id === selectedAgentId) {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(agent.pixelX + 2, agent.pixelY + 2, tileSize - 4, tileSize - 4);
      ctx.setLineDash([]);
    }

    // Hover highlight
    if (agent.id === hoveredAgentId && agent.id !== selectedAgentId) {
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.strokeRect(agent.pixelX + 2, agent.pixelY + 2, tileSize - 4, tileSize - 4);
      ctx.setLineDash([]);
    }

    ctx.restore();
  }
}

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

// ---------------------------------------------------------------------------
// Speech bubbles (pixel-styled task display above agents)
// ---------------------------------------------------------------------------

function renderSpeechBubble(
  ctx: CanvasRenderingContext2D,
  text: string,
  px: number,
  py: number,
  tileSize: number,
): void {
  const maxChars = 18;
  const displayText = text.length > maxChars ? text.slice(0, maxChars - 2) + '..' : text;

  ctx.font = '8px monospace';
  const metrics = ctx.measureText(displayText);
  const bubbleW = Math.max(metrics.width + 10, 40);
  const bubbleH = 16;
  const bubbleX = px + (tileSize - bubbleW) / 2;
  const bubbleY = py - bubbleH;

  // Bubble background (pixel green like OpenClaw)
  ctx.fillStyle = 'rgba(34, 80, 48, 0.92)';
  ctx.fillRect(bubbleX, bubbleY, bubbleW, bubbleH);

  // Pixel border
  ctx.strokeStyle = '#4ade80';
  ctx.lineWidth = 1;
  ctx.strokeRect(bubbleX, bubbleY, bubbleW, bubbleH);

  // Triangle pointer
  const triX = px + tileSize / 2;
  ctx.fillStyle = 'rgba(34, 80, 48, 0.92)';
  ctx.beginPath();
  ctx.moveTo(triX - 3, bubbleY + bubbleH);
  ctx.lineTo(triX + 3, bubbleY + bubbleH);
  ctx.lineTo(triX, bubbleY + bubbleH + 4);
  ctx.closePath();
  ctx.fill();

  // Text
  ctx.fillStyle = '#bbf7d0';
  ctx.fillText(displayText, bubbleX + 5, bubbleY + 11);
}

// ---------------------------------------------------------------------------
// Agent status bar (top tabs like OpenClaw)
// ---------------------------------------------------------------------------

function updateAgentStatusBar(): void {
  const container = document.getElementById('agent-tabs');
  if (!container) return;

  const agentList = Array.from(agents.values());
  if (agentList.length === 0) {
    container.innerHTML = '<span class="agent-tab-empty">No agents in office</span>';
    return;
  }

  const tabs = agentList.map(agent => {
    const statusColor = getStatusColor(agent.state);
    const isSelected = agent.id === selectedAgentId;
    const cls = isSelected ? 'agent-tab selected' : 'agent-tab';
    return `<button class="${cls}" data-agent-id="${agent.id}">
      <span class="tab-dot" style="background:${statusColor};box-shadow:0 0 4px ${statusColor}"></span>
      <span class="tab-name">${agent.name}</span>
      <span class="tab-state">${agent.state}</span>
    </button>`;
  }).join('');

  // Only update DOM if changed (avoid flicker)
  const newContent = tabs;
  if (container.dataset.lastContent !== newContent) {
    container.innerHTML = newContent;
    container.dataset.lastContent = newContent;

    // Attach click handlers
    container.querySelectorAll('.agent-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const id = (tab as HTMLElement).dataset.agentId;
        if (!id) return;
        const agent = agents.get(id);
        if (!agent) return;
        if (selectedAgentId === id) {
          selectedAgentId = null;
          hideAgentPanel();
        } else {
          selectedAgentId = id;
          showAgentPanel(agent);
        }
        vscode.postMessage({ type: 'agentClicked', payload: { id, name: agent.name } });
      });
    });
  }
}

function getStatusColor(state: string): string {
  switch (state) {
    case 'typing': case 'reading': return '#4ade80'; // green = active
    case 'thinking': case 'spawning': return '#facc15'; // yellow = processing
    case 'error': return '#f87171'; // red
    case 'done': return '#60a5fa'; // blue
    case 'walking': return '#c084fc'; // purple = moving
    default: return '#6b7280'; // gray = idle
  }
}

// ---------------------------------------------------------------------------
// Hover detection and tooltip
// ---------------------------------------------------------------------------

function handleMouseMove(event: MouseEvent): void {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const mouseX = (event.clientX - rect.left) * scaleX;
  const mouseY = (event.clientY - rect.top) * scaleY;

  const tileSize = getTileSize();
  const spriteH = getSpriteHeight();
  let foundId: string | null = null;

  agents.forEach((agent) => {
    const hitTop = agent.pixelY + tileSize - spriteH;
    if (
      mouseX >= agent.pixelX &&
      mouseX <= agent.pixelX + tileSize &&
      mouseY >= hitTop &&
      mouseY <= agent.pixelY + tileSize
    ) {
      foundId = agent.id;
    }
  });

  if (foundId !== hoveredAgentId) {
    hoveredAgentId = foundId;
    if (foundId) {
      const agent = agents.get(foundId);
      if (agent) showHoverTooltip(agent, event.clientX, event.clientY);
    } else {
      hideHoverTooltip();
    }
  }

  // Update tooltip position if still hovering
  if (hoveredAgentId) {
    const tooltip = document.getElementById('hover-tooltip');
    if (tooltip) {
      tooltip.style.left = (event.clientX + 16) + 'px';
      tooltip.style.top = (event.clientY - 8) + 'px';
    }
  }
}

function showHoverTooltip(agent: Agent, clientX: number, clientY: number): void {
  const tooltip = document.getElementById('hover-tooltip');
  if (!tooltip) return;

  const elapsed = Math.floor((Date.now() - agent.startedAt) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const statusColor = getStatusColor(agent.state);

  tooltip.innerHTML = `
    <div class="tt-header">
      <span class="tt-dot" style="background:${statusColor}"></span>
      <span class="tt-name">${agent.name}</span>
      <span class="tt-model">${agent.model}</span>
    </div>
    <div class="tt-row"><span>State</span><span style="color:${statusColor}">${agent.state}</span></div>
    <div class="tt-row"><span>Time</span><span>${mins}m ${secs}s</span></div>
    <div class="tt-task">${agent.taskSummary || 'No task'}</div>
    <div class="tt-hint">Click for full dossier</div>
  `;

  tooltip.style.left = (clientX + 16) + 'px';
  tooltip.style.top = (clientY - 8) + 'px';
  tooltip.classList.add('visible');
}

function hideHoverTooltip(): void {
  const tooltip = document.getElementById('hover-tooltip');
  if (tooltip) tooltip.classList.remove('visible');
}

// ---------------------------------------------------------------------------
// Click handling
// ---------------------------------------------------------------------------

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
    const hitTop = agent.pixelY + tileSize - spriteH;
    if (
      clickX >= agent.pixelX &&
      clickX <= agent.pixelX + tileSize &&
      clickY >= hitTop &&
      clickY <= agent.pixelY + tileSize
    ) {
      if (selectedAgentId === agent.id) {
        // Toggle off
        selectedAgentId = null;
        hideAgentPanel();
      } else {
        selectedAgentId = agent.id;
        showAgentPanel(agent);
      }
      clicked = true;
      vscode.postMessage({ type: 'agentClicked', payload: { id: agent.id, name: agent.name } });
    }
  });

  if (!clicked) {
    selectedAgentId = null;
    hideAgentPanel();
  }
}

// ---------------------------------------------------------------------------
// Message handling
// ---------------------------------------------------------------------------

function handleMessage(event: MessageEvent): void {
  const msg = event.data;
  switch (msg.type) {
    case 'agentAdd': {
      const a = msg.payload;
      const agent = createAgent(a.id, a.name, a.variant, a.model, a.branch, a.taskSummary, a.parentId);
      agents.set(a.id, agent);

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
        agents.set(id, triggerDeparture(existing));
      }
      break;
    }
    case 'agentDepartSubAgents': {
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

// Auto-init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
