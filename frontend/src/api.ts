import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Workspace, Entry, Document } from './types';

export const desktop = isTauri();
let compilationQueue: Promise<unknown> = Promise.resolve();
function command<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!desktop) return Promise.reject(new Error('Open the desktop app to work with files. This browser preview provides a local scratchpad.'));
  return invoke<T>(name, args);
}
export const api = {
  requested: () => command<Workspace | null>('open_requested'),
  quit: () => command<void>('quit_app'),
  baseline: (workspaceId: number, path: string) => command<{ contents: string; revision: string | null; isNew: boolean }>('git_baseline', { workspaceId, path }),
  choose: (folder: boolean) => command<Workspace | null>('choose_workspace', { folder }),
  list: (workspaceId: number, path = '') => command<Entry[]>('list_directory', { workspaceId, path }),
  search: (workspaceId: number, query: string) => command<{ paths: string[]; truncated: boolean }>('search_files', { workspaceId, query }),
  read: (workspaceId: number, path: string) => command<Document>('read_document', { workspaceId, path }),
  save: (workspaceId: number, path: string, contents: string, version: string) => command<string>('save_document', { workspaceId, path, contents, version }),
  create: (workspaceId: number, path: string, directory: boolean) => command<void>('create_entry', { workspaceId, path, directory }),
  rename: (workspaceId: number, path: string, destination: string) => command<void>('rename_entry', { workspaceId, path, destination }),
  duplicate: (workspaceId: number, path: string, destination: string) => command<void>('duplicate_entry', { workspaceId, path, destination }),
  trash: (workspaceId: number, path: string) => command<void>('trash_entry', { workspaceId, path }),
  image: (workspaceId: number, path: string) => command<string>('read_image', { workspaceId, path }),
  reveal: (workspaceId: number, path: string) => command<void>('reveal_entry', { workspaceId, path }),
  external: (url: string) => desktop ? command<void>('open_external', { url }) : Promise.resolve(window.open(url, '_blank', 'noopener,noreferrer')).then(() => {}),
  compile: (workspaceId: number, path: string, contents: string) => {
    const result = compilationQueue.then(() => command<{ pdf: string | null; log: string }>('compile_tex', { workspaceId, path, contents }));
    compilationQueue = result.catch(() => {});
    return result;
  },
  install: () => command<string>('install_cli'),
  exportMarkdown: (html: string, title: string) => command<string | null>('export_markdown', { html, title }),
  savePdf: (data: string, name: string) => command<string | null>('save_pdf', { data, name }),
  terminalStart: (workspaceId: number, path: string, cols: number, rows: number) => command<{ id: number; cwd: string }>('terminal_start', { workspaceId, path, cols, rows }),
  terminalWrite: (id: number, data: string) => command<void>('terminal_write', { id, data }),
  terminalResize: (id: number, cols: number, rows: number) => command<void>('terminal_resize', { id, cols, rows }),
  terminalAck: (id: number, bytes: number) => command<void>('terminal_ack', { id, bytes }),
  terminalStop: (id: number) => command<void>('terminal_stop', { id }),
};
