import { isWorkspace, type Workspace } from '../domain/graph';
import { demoWorkspace } from '../data/demo';

const LEGACY_KEY = 'mindtrace.workspace.v1';
const DATABASE = 'uisim.workspace.v1';
const STORE = 'records';
const CURRENT = 'current';
export const MAX_IMPORT_BYTES = 16 * 1024 * 1024;

function demo(): Workspace { return structuredClone(demoWorkspace); }

/** Synchronous legacy loader for a safe initial screen while IndexedDB hydrates. */
export function loadWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return demo();
    const candidate: unknown = JSON.parse(raw);
    if (!isWorkspace(candidate)) return demo();
    if (candidate.isDemo && candidate.id === demoWorkspace.id) return demo();
    return candidate;
  } catch {
    return demo();
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable.'));
      return;
    }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Cannot open IndexedDB.'));
    request.onblocked = () => reject(new Error('IndexedDB upgrade is blocked.'));
  });
}
async function fromDatabase(): Promise<Workspace | null> {
  const db = await openDatabase();
  try {
    const candidate: unknown = await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readonly');
      const request = transaction.objectStore(STORE).get(CURRENT);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Cannot read saved graph.'));
    });
    if (candidate === undefined) return null;
    if (!isWorkspace(candidate)) throw new Error('Saved IndexedDB workspace is invalid.');
    if (candidate.isDemo && candidate.id === demoWorkspace.id) return demo();
    return candidate;
  } finally {
    db.close();
  }
}

/** Prefer large-capacity local IndexedDB; preserve old localStorage user data. */
export async function loadStoredWorkspace(): Promise<Workspace> {
  try {
    const data = await fromDatabase();
    return data ?? loadWorkspace();
  } catch {
    return loadWorkspace();
  }
}
async function writeDatabase(workspace: Workspace): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Cannot save graph.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Graph save was aborted.'));
      transaction.objectStore(STORE).put(workspace, CURRENT);
    });
  } finally {
    db.close();
  }
}
let saving: Promise<void> = Promise.resolve();

/**
 * Serialize writes to avoid a slow older graph overwriting a newer snapshot.
 * If IndexedDB is unsupported, retain the original localStorage fallback.
 */
export function saveWorkspace(workspace: Workspace): Promise<void> {
  const attempt = saving.then(async () => {
    try {
      await writeDatabase(workspace);
    } catch {
      localStorage.setItem(LEGACY_KEY, JSON.stringify(workspace));
    }
  });
  saving = attempt.catch(() => {});
  return attempt;
}
export function parseImport(raw: string): Workspace {
  if (new Blob([raw]).size > MAX_IMPORT_BYTES) throw new Error('Import must be under 16 MB.');
  const data: unknown = JSON.parse(raw);
  if (!isWorkspace(data)) throw new Error('Invalid MindTrace v1 workspace. Check IDs, node types, and edge references.');
  return data;
}
export function downloadWorkspace(workspace: Workspace): void {
  const blob = new Blob([JSON.stringify(workspace, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `mindtrace-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
