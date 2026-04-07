/**
 * Extension entry point.
 * Registers commands, starts agent monitoring, manages status bar.
 * Bridges between AgentMonitor (filesystem) and WebviewPanel (UI).
 * Handles sub-agent lifecycle: spawning, departure, and cleanup.
 */

import * as vscode from 'vscode';
import { AgentArcadePanel } from './webviewProvider';
import { AgentMonitor, DetectedAgent, generateAgentName } from './agentMonitor';

let monitor: AgentMonitor | null = null;
let statusBarItem: vscode.StatusBarItem;
let currentAgentCount = 0;

export function activate(context: vscode.ExtensionContext): void {
  console.log('Agent Arcade: Extension activated');

  // Status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'agentArcade.openOffice';
  updateStatusBar(0);
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Register commands
  const openOfficeCmd = vscode.commands.registerCommand('agentArcade.openOffice', () => {
    const panel = AgentArcadePanel.createOrShow(context.extensionUri);
    setupPanelBridge(panel);
  });

  const toggleSoundCmd = vscode.commands.registerCommand('agentArcade.toggleSound', () => {
    const config = vscode.workspace.getConfiguration('agentArcade');
    const current = config.get<boolean>('soundEnabled', true);
    config.update('soundEnabled', !current, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(
      `Agent Arcade: Sound ${!current ? 'enabled' : 'disabled'}`
    );
  });

  context.subscriptions.push(openOfficeCmd, toggleSoundCmd);

  // Start monitoring Claude Code sessions (for transcript-based state updates)
  monitor = new AgentMonitor((agents) => {
    handleAgentChanges(agents);
  });
  monitor.start();

  // Remove agent character when its terminal is closed
  const terminalCloseListener = vscode.window.onDidCloseTerminal((terminal) => {
    const agentId = spawnedTerminals.get(terminal);
    if (agentId) {
      spawnedTerminals.delete(terminal);
      const panel = AgentArcadePanel.currentPanel;
      if (panel) {
        panel.postMessage({
          type: 'agentRemove',
          payload: { id: agentId },
        });
      }
      currentAgentCount = Math.max(0, currentAgentCount - 1);
      updateStatusBar(currentAgentCount);
    }
  });

  context.subscriptions.push(terminalCloseListener, {
    dispose: () => {
      if (monitor) {
        monitor.stop();
        monitor = null;
      }
    },
  });
}

function updateStatusBar(count: number): void {
  const icon = count > 0 ? '$(person)' : '$(person-outline)';
  statusBarItem.text = `${icon} ${count} agent${count !== 1 ? 's' : ''}`;
  statusBarItem.tooltip = count > 0
    ? `${count} Claude Code agent${count !== 1 ? 's' : ''} active - Click to open office`
    : 'No active agents - Click to open office';
}

/** Track previous agent states to detect changes */
const previousAgents = new Map<string, DetectedAgent>();
const agentVariants = new Map<string, number>(); // Persist variant assignment per agent ID
let variantCounter = 0;

/**
 * Bridge between spawned agents (from + Agent button) and monitor-detected sessions.
 * Maps: monitor session ID -> spawned agent ID.
 * When the monitor finds a new session, we check if a recently spawned terminal
 * exists that hasn't been linked yet. If so, we link them so updates flow to
 * the spawned agent instead of creating a duplicate character.
 */
const monitorToSpawnedMap = new Map<string, string>();
const spawnedAgentTimestamps = new Map<string, number>(); // agentId -> spawn time
const SPAWN_LINK_WINDOW_MS = 30_000; // 30 seconds to link a spawned agent

function getVariantForAgent(id: string): number {
  const existing = agentVariants.get(id);
  if (existing !== undefined) return existing;
  const variant = variantCounter % 6;
  variantCounter++;
  agentVariants.set(id, variant);
  return variant;
}

function handleAgentChanges(agents: Map<string, DetectedAgent>): void {
  const panel = AgentArcadePanel.currentPanel;

  // Detect new agents
  agents.forEach((agent, id) => {
    if (!previousAgents.has(id)) {
      // Check if this monitor-detected session should be linked to a spawned agent
      const linkedSpawnId = tryLinkToSpawnedAgent(id);

      if (linkedSpawnId) {
        // This session belongs to a spawned agent: send updates to that ID, don't create new character
        console.log(`Agent Arcade: Linked monitor session ${id} to spawned agent ${linkedSpawnId}`);
        if (panel) {
          panel.postMessage({
            type: 'agentUpdate',
            payload: {
              id: linkedSpawnId,
              state: agent.activity,
              taskSummary: agent.lastMessage || 'Working...',
            },
          });
        }
      } else {
        // Genuinely new agent: create character
        const variant = getVariantForAgent(id);

        if (panel) {
          panel.postMessage({
            type: 'agentAdd',
            payload: {
              id: agent.id,
              name: agent.name,
              variant,
              model: agent.model,
              branch: agent.branch,
              taskSummary: agent.lastMessage || 'Starting...',
              parentId: agent.parentId || undefined,
            },
          });
        }
      }
    } else {
      // Existing agent: check for state changes
      const prev = previousAgents.get(id)!;
      if (prev.activity !== agent.activity || prev.lastMessage !== agent.lastMessage) {
        // Route updates to spawned agent if linked
        const targetId = monitorToSpawnedMap.get(id) || agent.id;

        if (panel) {
          panel.postMessage({
            type: 'agentUpdate',
            payload: {
              id: targetId,
              state: agent.activity,
              taskSummary: agent.lastMessage,
            },
          });
        }

        // Sound notification on completion
        if (agent.activity === 'done' && prev.activity !== 'done') {
          const soundEnabled = vscode.workspace.getConfiguration('agentArcade')
            .get<boolean>('soundEnabled', true);
          if (soundEnabled) {
            vscode.window.showInformationMessage(
              `Agent Arcade: ${agent.name} completed their task!`
            );
          }

          if (agent.spawnedChildIds.length > 0 && panel) {
            panel.postMessage({
              type: 'agentDepartSubAgents',
              payload: { parentId: targetId },
            });
          }
        }
      }

      // Detect newly spawned children
      if (agent.spawnedChildIds.length > prev.spawnedChildIds.length) {
        console.log(
          `Agent Arcade: ${agent.name} spawned ${agent.spawnedChildIds.length - prev.spawnedChildIds.length} sub-agent(s)`
        );
      }
    }
  });

  // Detect removed agents: trigger wave goodbye instead of instant removal
  previousAgents.forEach((prevAgent, id) => {
    if (!agents.has(id)) {
      if (panel) {
        panel.postMessage({
          type: 'agentRemove',
          payload: { id },
        });
      }
    }
  });

  // Update tracking
  previousAgents.clear();
  agents.forEach((agent, id) => previousAgents.set(id, agent));

  // Update status bar
  const count = agents.size;
  if (count !== currentAgentCount) {
    currentAgentCount = count;
    updateStatusBar(count);
  }
}

function setupPanelBridge(panel: AgentArcadePanel): void {
  panel.onMessage((msg) => {
    switch (msg.type) {
      case 'ready': {
        // Send all current agents to the newly opened panel
        if (monitor) {
          const agents = monitor.getAgents();
          agents.forEach((agent) => {
            const variant = getVariantForAgent(agent.id);
            panel.postMessage({
              type: 'agentAdd',
              payload: {
                id: agent.id,
                name: agent.name,
                variant,
                model: agent.model,
                branch: agent.branch,
                taskSummary: agent.lastMessage || 'Working...',
                parentId: agent.parentId || undefined,
              },
            });
          });
        }
        break;
      }
      case 'agentClicked': {
        const payload = msg.payload as { id: string; name: string };
        console.log(`Agent Arcade: Agent clicked - ${payload.name} (${payload.id})`);
        // Focus the agent's terminal
        focusAgentTerminal(payload.id);
        break;
      }
      case 'agentDeparted': {
        const payload = msg.payload as { id: string };
        console.log(`Agent Arcade: Agent departed - ${payload.id}`);
        break;
      }
      case 'spawnAgent': {
        const payload = msg.payload as { prompt: string };
        spawnClaudeCodeAgent(payload.prompt);
        break;
      }
      case 'killAgent': {
        const payload = msg.payload as { id: string };
        killAgentTerminal(payload.id);
        break;
      }
    }
  });
}

let spawnCounter = 0;

/** Open a new terminal with Claude Code and immediately add character to office */
function spawnClaudeCodeAgent(prompt: string): void {
  spawnCounter++;
  const agentId = `spawned-${spawnCounter}-${Date.now()}`;
  const agentName = generateAgentName();
  const variant = getVariantForAgent(agentId);
  const terminalName = agentName;

  // Build the command – use full path to avoid shell alias issues
  // and explicit --permission-mode to guarantee bypass mode
  const claudeBin = process.env.HOME
    ? `${process.env.HOME}/.local/bin/claude`
    : 'claude';
  let command = `${claudeBin} --dangerously-skip-permissions`;
  if (prompt) {
    const escaped = prompt.replace(/'/g, "'\\''");
    command += ` -p '${escaped}'`;
  }

  const terminal = vscode.window.createTerminal({
    name: terminalName,
    iconPath: new vscode.ThemeIcon('hubot'),
  });

  terminal.show(false);
  terminal.sendText(command);

  // Immediately add character to the office (don't wait for transcript)
  const panel = AgentArcadePanel.currentPanel;
  if (panel) {
    panel.postMessage({
      type: 'agentAdd',
      payload: {
        id: agentId,
        name: agentName,
        variant,
        model: 'claude',
        branch: 'main',
        taskSummary: prompt ? prompt.slice(0, 60) : 'Waiting for input...',
      },
    });
  }

  // Update status bar
  currentAgentCount++;
  updateStatusBar(currentAgentCount);

  // Track spawned agents so they can be removed when terminal closes
  spawnedTerminals.set(terminal, agentId);
  // Register timestamp so monitor can link its detected session to this agent
  spawnedAgentTimestamps.set(agentId, Date.now());

  vscode.window.showInformationMessage(
    `Agent Arcade: ${agentName} has entered the office`
  );
}

/** Track terminals to agent IDs for cleanup on close */
const spawnedTerminals = new Map<vscode.Terminal, string>();

/** Focus (show) the terminal associated with an agent */
function focusAgentTerminal(agentId: string): void {
  spawnedTerminals.forEach((id, terminal) => {
    if (id === agentId) {
      terminal.show(false);
    }
  });
}

/**
 * Try to link a newly detected monitor session to a recently spawned agent.
 * Returns the spawned agent ID if linked, null otherwise.
 */
function tryLinkToSpawnedAgent(monitorSessionId: string): string | null {
  // Already linked?
  if (monitorToSpawnedMap.has(monitorSessionId)) {
    return monitorToSpawnedMap.get(monitorSessionId)!;
  }

  const now = Date.now();

  // Find a spawned agent that hasn't been linked yet (within time window)
  for (const [spawnedId, spawnTime] of spawnedAgentTimestamps) {
    if (now - spawnTime > SPAWN_LINK_WINDOW_MS) continue;

    // Check if this spawned ID is already linked to a different session
    let alreadyLinked = false;
    monitorToSpawnedMap.forEach((linkedSpawnId) => {
      if (linkedSpawnId === spawnedId) alreadyLinked = true;
    });
    if (alreadyLinked) continue;

    // Link them
    monitorToSpawnedMap.set(monitorSessionId, spawnedId);
    return spawnedId;
  }

  return null;
}

/** Kill an agent's terminal and remove its character instantly */
function killAgentTerminal(agentId: string): void {
  // Find the terminal for this agent
  let targetTerminal: vscode.Terminal | null = null;
  spawnedTerminals.forEach((id, terminal) => {
    if (id === agentId) {
      targetTerminal = terminal;
    }
  });

  if (targetTerminal) {
    // Dispose kills the terminal process
    (targetTerminal as vscode.Terminal).dispose();
    spawnedTerminals.delete(targetTerminal);
    console.log(`Agent Arcade: Killed terminal for agent ${agentId}`);
  } else {
    console.log(`Agent Arcade: No terminal found for agent ${agentId}, removing character only`);
  }

  // Update status bar
  currentAgentCount = Math.max(0, currentAgentCount - 1);
  updateStatusBar(currentAgentCount);
}

export function deactivate(): void {
  if (monitor) {
    monitor.stop();
    monitor = null;
  }
}
