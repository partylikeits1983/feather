import { useEffect, useState } from 'preact/hooks';
import type { Entry, Workspace } from '../types';
import { isText } from '../types';
import { api } from '../api';
import { Icon } from '../components/Icon';

export function Explorer({ collapsed, workspace, active, revision, onOpen, onMenu, onError }: {
  collapsed: boolean; workspace: Workspace; active: string; revision: number; onOpen: (path: string) => void;
  onMenu: (entry: Entry, x: number, y: number) => void; onError: (message: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['']));
  const [cache, setCache] = useState<Record<string, Entry[]>>({});
  useEffect(() => { setExpanded(new Set([''])); setCache({}); }, [workspace.id]);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([...expanded].map(async path => [path, await api.list(workspace.id, path).catch(error => { if (path === '') onError(String(error)); return []; })] as const)).then(entries => {
      if (!cancelled) setCache(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
  }, [workspace.id, expanded, revision]);
  const renderDirectory = (path: string, depth: number) => (cache[path] || []).map(entry => <div key={entry.path} role="none">
    <div class={`tree-row ${entry.path === active ? 'selected' : ''}`} role="none">
      <button class={`tree-item ${!entry.isDir && !isText(entry.path) ? 'asset' : ''}`} style={{ paddingLeft: `${16 + depth * 16}px` }}
        title={entry.path} role="treeitem" aria-selected={entry.path === active} aria-expanded={entry.isDir ? expanded.has(entry.path) : undefined}
        onClick={() => entry.isDir ? setExpanded(previous => { const next = new Set(previous); next.has(entry.path) ? next.delete(entry.path) : next.add(entry.path); return next; }) : isText(entry.path) ? onOpen(entry.path) : onMenu(entry, 24 + depth * 16, 180)}
        onContextMenu={event => { event.preventDefault(); onMenu(entry, event.clientX, event.clientY); }}>
        {entry.isDir ? <><Icon name="chevron" size={11} class={expanded.has(entry.path) ? 'rotated' : ''} /><Icon name="folder" size={15} /></> : <><span class="tree-spacer" /><span class={`file-glyph ${entry.path.endsWith('.tex') ? 'tex' : ''}`}>{entry.path.endsWith('.tex') ? 'T' : isText(entry.path) ? 'M' : '·'}</span></>}
        <span class="tree-name">{entry.name}</span>
      </button>
      <button class="tree-more icon-button" title={`Actions for ${entry.name}`} aria-label={`Actions for ${entry.name}`} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); onMenu(entry, rect.left, rect.bottom); }}><Icon name="more" size={14} /></button>
    </div>
    {entry.isDir && expanded.has(entry.path) && <div role="group">{renderDirectory(entry.path, depth + 1)}</div>}
  </div>);
  return <div id="workspace-files" class="tree" hidden={collapsed} role="tree" aria-label="Files">{renderDirectory('', 0)}{cache['']?.length === 0 && <p class="tree-empty">A fresh start.<br />Create your first Markdown file above.</p>}</div>;
}
