/**
 * Monitors Claude Code JSONL transcript files to detect agent activity.
 * Only watches sessions in the current workspace's project directory.
 * Parses transcript entries to determine agent state (typing, reading, thinking, etc).
 *
 * Claude Code stores transcripts at ~/.claude/projects/<project-hash>/<session-id>.jsonl
 * where project-hash = workspace path with :, \, / replaced by -
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type AgentActivity = 'idle' | 'typing' | 'reading' | 'thinking' | 'done' | 'error';

export interface DetectedAgent {
  id: string;
  sessionDir: string;
  model: string;
  branch: string;
  activity: AgentActivity;
  lastMessage: string;
  lastUpdate: number;
  name: string;
  parentId: string | null;
  spawnedChildIds: string[];
}

type AgentChangeCallback = (agents: Map<string, DetectedAgent>) => void;

/** How recently a session file must have been written to be considered active */
const ACTIVE_SESSION_AGE_MS = 120_000; // 2 minutes

/** How long an agent can be silent before removal */
const STALE_AGENT_TIMEOUT_MS = 120_000; // 2 minutes

/** Poll interval for scanning sessions */
const POLL_INTERVAL_MS = 2_000;

/** Human-sounding names for agents */
const AGENT_NAMES = [
  'Ada', 'Kai', 'Mika', 'Ravi', 'Zara', 'Luca', 'Noor', 'Enzo',
  'Suki', 'Omar', 'Yuki', 'Dani', 'Ines', 'Theo', 'Mira', 'Remy',
  'Aria', 'Hugo', 'Luna', 'Jude', 'Iris', 'Axel', 'Cleo', 'Finn',
  'Rosa', 'Elio', 'Maya', 'Nico', 'Tara', 'Alec', 'Sage', 'Cruz',
  'Lyra', 'Dean', 'Kira', 'Noah', 'Vera', 'Cole', 'Jade', 'Rune',
  'Niko', 'Sven', 'Zoe', 'Teo', 'Ivy', 'Leo', 'Nova', 'Kit',
];

/** Track used names to avoid duplicates in the same session */
const usedNames = new Set<string>();

export function generateAgentName(): string {
  // Try to find an unused name
  for (let attempt = 0; attempt < 50; attempt++) {
    const name = AGENT_NAMES[Math.floor(Math.random() * AGENT_NAMES.length)];
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
  }
  // Fallback: add a number suffix
  const name = AGENT_NAMES[Math.floor(Math.random() * AGENT_NAMES.length)];
  return `${name} ${usedNames.size + 1}`;
}

export class AgentMonitor {
  private agents: Map<string, DetectedAgent> = new Map();
  private filePositions: Map<string, number> = new Map();
  private onChange: AgentChangeCallback;
  private pollInterval: NodeJS.Timeout | null = null;
  private disposed = false;
  private agentCounter = 0;
  /** Session files that existed before the monitor started (ignored) */
  private preExistingFiles = new Set<string>();

  constructor(onChange: AgentChangeCallback) {
    this.onChange = onChange;
  }

  start(): void {
    // Snapshot ALL existing session files so we can ignore them.
    // Only sessions that appear AFTER this point will become agents.
    this.snapshotExistingFiles();

    console.log(`Agent Arcade: Ignoring ${this.preExistingFiles.size} pre-existing session(s)`);

    // Poll for new sessions
    this.pollInterval = setInterval(() => {
      if (this.disposed) return;
      const projectDirs = this.getProjectDirs();
      for (const dir of projectDirs) {
        this.scanSessions(dir);
      }
      this.checkTranscripts();
    }, POLL_INTERVAL_MS);
  }

  /** Record all currently existing .jsonl files so we skip them later */
  private snapshotExistingFiles(): void {
    const homeDir = os.homedir();
    const claudeProjectsDir = path.join(homeDir, '.claude', 'projects');
    if (!fs.existsSync(claudeProjectsDir)) return;

    try {
      const entries = fs.readdirSync(claudeProjectsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dirPath = path.join(claudeProjectsDir, entry.name);
        const files = this.findSessionFiles(dirPath);
        for (const f of files) {
          this.preExistingFiles.add(f);
        }
      }
    } catch {
      // Skip
    }
  }

  stop(): void {
    this.disposed = true;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Compute project directory paths for the current workspace.
   * Claude Code uses: ~/.claude/projects/<hash> where hash = path with / : \ -> -
   */
  private getProjectDirs(): string[] {
    const homeDir = os.homedir();
    const claudeProjectsDir = path.join(homeDir, '.claude', 'projects');

    // Check custom path override
    const customPath = vscode.workspace.getConfiguration('agentArcade').get<string>('transcriptPath');
    if (customPath && fs.existsSync(customPath)) {
      return [customPath];
    }

    if (!fs.existsSync(claudeProjectsDir)) {
      return [];
    }

    // Get workspace folder paths and compute their Claude Code hashes
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      // No workspace open: fall back to scanning all recent project dirs
      return this.findRecentProjectDirs(claudeProjectsDir);
    }

    const dirs: string[] = [];
    for (const folder of workspaceFolders) {
      const wsPath = folder.uri.fsPath;
      // Claude Code hash: replace / \ : with -
      const hash = wsPath.replace(/[/\\:]/g, '-');
      const projectDir = path.join(claudeProjectsDir, hash);
      if (fs.existsSync(projectDir)) {
        dirs.push(projectDir);
      }
    }

    // If no matching dirs found, fall back to recent dirs
    if (dirs.length === 0) {
      return this.findRecentProjectDirs(claudeProjectsDir);
    }

    return dirs;
  }

  /** Fallback: find project dirs that have recently modified files */
  private findRecentProjectDirs(claudeProjectsDir: string): string[] {
    const dirs: string[] = [];
    try {
      const entries = fs.readdirSync(claudeProjectsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dirPath = path.join(claudeProjectsDir, entry.name);
        // Check if any file was recently modified
        const hasRecent = this.findSessionFiles(dirPath).some(f => {
          try {
            const stat = fs.statSync(f);
            return Date.now() - stat.mtimeMs < ACTIVE_SESSION_AGE_MS;
          } catch {
            return false;
          }
        });
        if (hasRecent) {
          dirs.push(dirPath);
        }
      }
    } catch {
      // Skip
    }
    return dirs;
  }

  private scanSessions(projectDir: string): void {
    try {
      const sessionFiles = this.findSessionFiles(projectDir);

      for (const sessionFile of sessionFiles) {
        const sessionId = path.basename(sessionFile, '.jsonl');
        if (this.agents.has(sessionId)) continue;

        // Skip pre-existing sessions; only add genuinely new ones
        if (this.preExistingFiles.has(sessionFile)) continue;

        try {
          const stat = fs.statSync(sessionFile);
          const recentlyModified = (Date.now() - stat.mtimeMs) < ACTIVE_SESSION_AGE_MS;
          if (recentlyModified) {
            this.addAgent(sessionId, sessionFile);
          }
        } catch {
          // Skip inaccessible files
        }
      }
    } catch (err) {
      console.error('Agent Arcade: Error scanning sessions:', err);
    }
  }

  private findSessionFiles(dir: string): string[] {
    const files: string[] = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          files.push(fullPath);
        } else if (entry.isDirectory()) {
          files.push(...this.findSessionFiles(fullPath));
        }
      }
    } catch {
      // Skip inaccessible directories
    }
    return files;
  }

  private addAgent(sessionId: string, sessionFile: string, parentId?: string): void {
    this.agentCounter++;
    const name = parentId
      ? `Mini ${generateAgentName()}`
      : generateAgentName();

    const agent: DetectedAgent = {
      id: sessionId,
      sessionDir: path.dirname(sessionFile),
      model: 'unknown',
      branch: 'main',
      activity: 'idle',
      lastMessage: '',
      lastUpdate: Date.now(),
      name,
      parentId: parentId || null,
      spawnedChildIds: [],
    };

    // Parse existing transcript for initial state
    this.parseTranscript(sessionFile, agent);
    this.agents.set(sessionId, agent);

    // Register with parent if sub-agent
    if (parentId) {
      const parent = this.agents.get(parentId);
      if (parent) {
        parent.spawnedChildIds.push(sessionId);
      }
    }

    this.onChange(new Map(this.agents));
  }

  private checkTranscripts(): void {
    let changed = false;

    const toRemove: string[] = [];

    this.agents.forEach((agent, id) => {
      const jsonlPath = path.join(agent.sessionDir, `${id}.jsonl`);
      try {
        const stat = fs.statSync(jsonlPath);
        if (stat.mtimeMs > agent.lastUpdate) {
          this.parseTranscript(jsonlPath, agent);
          changed = true;
        } else {
          // Check if session has gone stale
          const silentTime = Date.now() - stat.mtimeMs;
          if (silentTime > STALE_AGENT_TIMEOUT_MS) {
            toRemove.push(id);
            changed = true;
          }
        }
      } catch {
        // Session file removed or inaccessible
        const age = Date.now() - agent.lastUpdate;
        if (age > STALE_AGENT_TIMEOUT_MS) {
          toRemove.push(id);
          changed = true;
        }
      }
    });

    for (const id of toRemove) {
      this.agents.delete(id);
    }

    if (changed) {
      this.onChange(new Map(this.agents));
    }
  }

  private parseTranscript(filePath: string, agent: DetectedAgent): void {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n');

      // Parse from the end to find latest state
      for (let i = lines.length - 1; i >= Math.max(0, lines.length - 20); i--) {
        try {
          const entry = JSON.parse(lines[i]);
          this.updateAgentFromEntry(agent, entry);
          if (agent.activity !== 'idle') break;
        } catch {
          // Skip malformed lines
        }
      }

      agent.lastUpdate = Date.now();
    } catch {
      // File read error
    }
  }

  private updateAgentFromEntry(agent: DetectedAgent, entry: Record<string, unknown>): void {
    // Detect model
    if (entry.model && typeof entry.model === 'string') {
      agent.model = entry.model;
    }

    // Detect activity from tool use
    const type = entry.type as string | undefined;
    const tool = entry.tool as string | undefined;

    if (type === 'tool_use' || type === 'tool_call') {
      if (tool === 'Write' || tool === 'Edit' || tool === 'NotebookEdit') {
        agent.activity = 'typing';
        agent.lastMessage = `Writing: ${tool}`;
      } else if (tool === 'Read' || tool === 'Grep' || tool === 'Glob' || tool === 'Search') {
        agent.activity = 'reading';
        agent.lastMessage = `Reading: ${tool}`;
      } else if (tool === 'Bash') {
        agent.activity = 'typing';
        agent.lastMessage = 'Running command';
      } else if (tool === 'Agent' || tool === 'Task') {
        agent.activity = 'thinking';
        const input = entry.input as Record<string, unknown> | undefined;
        const desc = input?.description as string | undefined;
        agent.lastMessage = desc
          ? `Spawning: ${desc.slice(0, 40)}`
          : 'Spawning sub-agent';
      } else {
        agent.activity = 'thinking';
        agent.lastMessage = `Using ${tool}`;
      }
    } else if (type === 'assistant' || type === 'response') {
      agent.activity = 'thinking';
      const msg = entry.message || entry.content;
      if (typeof msg === 'string') {
        agent.lastMessage = msg.slice(0, 60);
      }
    } else if (type === 'result' || type === 'completion') {
      agent.activity = 'done';
      agent.lastMessage = 'Task completed';
    } else if (type === 'error') {
      agent.activity = 'error';
      const msg = entry.message || entry.error;
      agent.lastMessage = typeof msg === 'string' ? msg.slice(0, 60) : 'Error';
    }
  }

  getAgents(): Map<string, DetectedAgent> {
    return new Map(this.agents);
  }
}
