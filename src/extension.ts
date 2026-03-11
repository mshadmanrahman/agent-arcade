/**
 * Extension entry point.
 * Registers commands, starts agent monitoring, manages status bar.
 * Bridges between AgentMonitor (filesystem) and WebviewPanel (UI).
 * Handles sub-agent lifecycle: spawning, departure, and cleanup.
 */

import * as vscode from 'vscode';
import { PixelAgentsPanel } from './webviewProvider';
import { AgentMonitor, DetectedAgent } from './agentMonitor';

let monitor: AgentMonitor | null = null;
let statusBarItem: vscode.StatusBarItem;
let currentAgentCount = 0;

export function activate(context: vscode.ExtensionContext): void {
  console.log('Pixel Agents: Extension activated');

  // Status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'pixelAgents.openOffice';
  updateStatusBar(0);
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Register commands
  const openOfficeCmd = vscode.commands.registerCommand('pixelAgents.openOffice', () => {
    const panel = PixelAgentsPanel.createOrShow(context.extensionUri);
    setupPanelBridge(panel);
  });

  const toggleSoundCmd = vscode.commands.registerCommand('pixelAgents.toggleSound', () => {
    const config = vscode.workspace.getConfiguration('pixelAgents');
    const current = config.get<boolean>('soundEnabled', true);
    config.update('soundEnabled', !current, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(
      `Pixel Agents: Sound ${!current ? 'enabled' : 'disabled'}`
    );
  });

  context.subscriptions.push(openOfficeCmd, toggleSoundCmd);

  // Start monitoring Claude Code sessions
  monitor = new AgentMonitor((agents) => {
    handleAgentChanges(agents);
  });
  monitor.start();

  context.subscriptions.push({
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

function getVariantForAgent(id: string): number {
  const existing = agentVariants.get(id);
  if (existing !== undefined) return existing;
  const variant = variantCounter % 6;
  variantCounter++;
  agentVariants.set(id, variant);
  return variant;
}

function handleAgentChanges(agents: Map<string, DetectedAgent>): void {
  const panel = PixelAgentsPanel.currentPanel;

  // Detect new agents
  agents.forEach((agent, id) => {
    if (!previousAgents.has(id)) {
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
    } else {
      // Existing agent: check for state changes
      const prev = previousAgents.get(id)!;
      if (prev.activity !== agent.activity || prev.lastMessage !== agent.lastMessage) {
        if (panel) {
          panel.postMessage({
            type: 'agentUpdate',
            payload: {
              id: agent.id,
              state: agent.activity,
              taskSummary: agent.lastMessage,
            },
          });
        }

        // Sound notification on completion
        if (agent.activity === 'done' && prev.activity !== 'done') {
          const soundEnabled = vscode.workspace.getConfiguration('pixelAgents')
            .get<boolean>('soundEnabled', true);
          if (soundEnabled) {
            vscode.window.showInformationMessage(
              `Pixel Agents: ${agent.name} completed their task!`
            );
          }

          // If this agent has sub-agents and just completed, trigger their departure
          if (agent.spawnedChildIds.length > 0 && panel) {
            panel.postMessage({
              type: 'agentDepartSubAgents',
              payload: { parentId: agent.id },
            });
          }
        }
      }

      // Detect newly spawned children (compare child arrays)
      if (agent.spawnedChildIds.length > prev.spawnedChildIds.length) {
        // New sub-agents were spawned. The new children will be picked up
        // as new agents in the next iteration. The webview handles the
        // spawning animation when it receives agentAdd with a parentId.
        console.log(
          `Pixel Agents: ${agent.name} spawned ${agent.spawnedChildIds.length - prev.spawnedChildIds.length} sub-agent(s)`
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

function setupPanelBridge(panel: PixelAgentsPanel): void {
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
        console.log(`Pixel Agents: Agent clicked - ${payload.name} (${payload.id})`);
        break;
      }
      case 'agentDeparted': {
        const payload = msg.payload as { id: string };
        console.log(`Pixel Agents: Agent departed - ${payload.id}`);
        break;
      }
      case 'spawnAgent': {
        const payload = msg.payload as { prompt: string };
        spawnClaudeCodeAgent(payload.prompt);
        break;
      }
    }
  });
}

let spawnCounter = 0;

/** Open a new terminal with Claude Code in dangerously-skip-permissions mode */
function spawnClaudeCodeAgent(prompt: string): void {
  spawnCounter++;
  const terminalName = `Claude Agent ${spawnCounter}`;

  // Build the command
  let command = 'claude --dangerously-skip-permissions';
  if (prompt) {
    // Escape single quotes in the prompt for shell safety
    const escaped = prompt.replace(/'/g, "'\\''");
    command += ` -p '${escaped}'`;
  }

  const terminal = vscode.window.createTerminal({
    name: terminalName,
    iconPath: new vscode.ThemeIcon('hubot'),
  });

  terminal.show(false); // false = don't take focus from the office view
  terminal.sendText(command);

  vscode.window.showInformationMessage(
    `Pixel Agents: Spawned ${terminalName}${prompt ? ' with task' : ''}`
  );
}

export function deactivate(): void {
  if (monitor) {
    monitor.stop();
    monitor = null;
  }
}
