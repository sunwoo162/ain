import { isWorkspace, type Workspace } from '../domain/graph';
import { demoWorkspace } from '../data/demo';

const KEY = 'mindtrace.workspace.v1';
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export function loadWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(demoWorkspace);
    const parsed: unknown = JSON.parse(raw);
    return isWorkspace(parsed) ? parsed : structuredClone(demoWorkspace);
  } catch {
    return structuredClone(demoWorkspace);
  }
}
export function saveWorkspace(workspace: Workspace): void {
  localStorage.setItem(KEY, JSON.stringify(workspace));
}
export function parseImport(raw: string): Workspace {
  if (new Blob([raw]).size > MAX_IMPORT_BYTES) throw new Error('Import must be under 2 MB.');
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
