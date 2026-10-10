import fs from 'node:fs';
import path from 'node:path';
import { executeMongoOperation } from './mongodb';

export type AgentId =
  | 'CALENDAR'
  | 'EMAIL'
  | 'YOUTUBE'
  | 'UBER'
  | 'SHEETS'
  | 'RESEARCH'
  | 'CHIEF_OF_STAFF';

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'waiting_approval';

export interface AgentTaskRecord {
  id: string;
  agentId: AgentId;
  action: string;
  title: string;
  status: TaskStatus;
  details: string;
  params?: Record<string, any>;
  result?: any;
  durationMs?: number;
  createdAt: string;
  updatedAt: string;
}

const CACHE_FILE = path.join(process.cwd(), '.tasks-store.json');

// In-memory task registry
const inMemoryTasks = new Map<string, AgentTaskRecord>();

// Load cache from disk
function loadFromDisk() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const content = fs.readFileSync(CACHE_FILE, 'utf-8');
      if (content && content.trim()) {
        const list = JSON.parse(content);
        if (Array.isArray(list) && list.length > 0) {
          for (const t of list) {
            if (t && t.id) {
              inMemoryTasks.set(t.id, t);
            }
          }
          return;
        }
      }
    }
  } catch (err: any) {
    console.warn('[Tasks Store] Load disk cache notice:', err?.message);
  }
}

// Save cache to disk
function saveToDisk() {
  try {
    const list = Array.from(inMemoryTasks.values());
    fs.writeFileSync(CACHE_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err: any) {
    console.warn('[Tasks Store] Save disk cache notice:', err?.message);
  }
}

// Initialize on module load
loadFromDisk();

/**
 * Retrieve all tasks with MongoDB Atlas sync and fallback
 */
export async function getAllTasks(options?: {
  status?: TaskStatus;
  agentId?: AgentId;
  limit?: number;
}): Promise<AgentTaskRecord[]> {
  try {
    const mongoTasks = await executeMongoOperation(async (db) => {
      return db
        .collection('agent_tasks')
        .find({})
        .sort({ createdAt: -1 })
        .limit(options?.limit || 50)
        .toArray();
    });

    if (mongoTasks && mongoTasks.length > 0) {
      for (const raw of mongoTasks) {
        const id = raw.id || raw._id?.toString() || `task-${Date.now()}`;
        const t: AgentTaskRecord = {
          id,
          agentId: raw.agentId || 'CHIEF_OF_STAFF',
          action: raw.action || 'execute',
          title: raw.title || 'Agent Action',
          status: raw.status || 'completed',
          details: raw.details || '',
          params: raw.params,
          result: raw.result,
          durationMs: raw.durationMs || 300,
          createdAt: raw.createdAt || new Date().toISOString(),
          updatedAt: raw.updatedAt || new Date().toISOString(),
        };
        inMemoryTasks.set(id, t);
      }
      saveToDisk();
    }
  } catch (err: any) {
    console.warn('[Tasks Store] MongoDB fetch notice:', err?.message);
  }

  // No artificial seed data: tasks only contain actions executed by user or connected agents

  let list = Array.from(inMemoryTasks.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  if (options?.status) {
    list = list.filter((t) => t.status === options.status);
  }

  if (options?.agentId) {
    list = list.filter((t) => t.agentId === options.agentId);
  }

  if (options?.limit && options.limit > 0) {
    list = list.slice(0, options.limit);
  }

  return list;
}

/**
 * Get pending approvals awaiting Human-in-the-Loop decision
 */
export async function getPendingApprovals(): Promise<AgentTaskRecord[]> {
  const all = await getAllTasks();
  return all.filter((t) => t.status === 'waiting_approval');
}

/**
 * Record a new agent task
 */
export async function recordTask(
  task: Omit<AgentTaskRecord, 'id' | 'createdAt' | 'updatedAt'>
): Promise<AgentTaskRecord> {
  const id = `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const nowStr = new Date().toISOString();

  const newRecord: AgentTaskRecord = {
    id,
    ...task,
    createdAt: nowStr,
    updatedAt: nowStr,
  };

  inMemoryTasks.set(id, newRecord);
  saveToDisk();

  try {
    await executeMongoOperation(async (db) => {
      await db.collection('agent_tasks').insertOne(newRecord);
    });
  } catch (err: any) {
    console.warn('[Tasks Store] MongoDB insert notice:', err?.message);
  }

  return newRecord;
}

/**
 * Update task status (e.g. approved, completed, failed)
 */
export async function updateTaskStatus(
  id: string,
  status: TaskStatus,
  result?: any
): Promise<AgentTaskRecord | null> {
  const existing = inMemoryTasks.get(id);
  if (!existing) {
    return null;
  }

  const updated: AgentTaskRecord = {
    ...existing,
    status,
    result: result !== undefined ? result : existing.result,
    updatedAt: new Date().toISOString(),
  };

  inMemoryTasks.set(id, updated);
  saveToDisk();

  try {
    await executeMongoOperation(async (db) => {
      await db
        .collection('agent_tasks')
        .updateOne({ id }, { $set: { status, result: updated.result, updatedAt: updated.updatedAt } });
    });
  } catch (err: any) {
    console.warn('[Tasks Store] MongoDB update notice:', err?.message);
  }

  return updated;
}
