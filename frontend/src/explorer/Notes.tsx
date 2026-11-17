import { Icon } from '../components/Icon';
import type { DocumentSession } from '../state/document';

export function Notes({ documents, active, collapsed, onToggle, onOpen, onCreate, onMenu }: {
  documents: DocumentSession[]; active: DocumentSession; collapsed: boolean;
  onToggle: () => void; onOpen: (path: string) => void; onCreate: () => void;
  onMenu: (note: DocumentSession, x: number, y: number) => void;
}) {
  return <section class="notes-section" aria-label="Personal notes">
    <div class="workspace-label workspace-heading notes-heading">
      <button class="workspace-toggle" aria-expanded={!collapsed} aria-controls="scratchpad-notes" onClick={onToggle}>
        <Icon name="chevron" size={11} class={collapsed ? '' : 'rotated'} /><Icon name="feather" size={14} /><span>Scratchpad</span>
      </button>
      <div class="explorer-actions"><button class="icon-button" title="New note" aria-label="New note" onClick={onCreate}><Icon name="plus" /></button></div>
    </div>
    <div id="scratchpad-notes" class="tree notes-tree" role="tree" aria-label="Notes" hidden={collapsed}>
      {documents.map((note, index) => <div class={`tree-row ${active === note ? 'selected' : ''}`} role="none" key={note.path}>
        <button class="tree-item note-item" role="treeitem" aria-selected={active === note} title={note.path} onClick={() => onOpen(note.path)}
          onContextMenu={event => { if (index) { event.preventDefault(); onMenu(note, event.clientX, event.clientY); } }}>
          <span class="tree-spacer" /><span class="file-glyph">M</span><span class="tree-name">{note.path}</span>
        </button>
        {index > 0 && <button class="tree-more icon-button" aria-label={`Note actions for ${note.path}`} title={`Note actions for ${note.path}`} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); onMenu(note, rect.left, rect.bottom); }}><Icon name="more" size={14} /></button>}
      </div>)}
    </div>
  </section>;
}
