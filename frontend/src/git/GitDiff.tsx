import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { MergeView } from '@codemirror/merge';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { api } from '../api';
import type { DocumentSession } from '../state/document';
import { Icon } from '../components/Icon';
import { editingExtensions } from '../editor/Editor';
import { syncDocument } from '../editor/sync';
import { configureVim } from '../editor/vim';
import { configureLanguage } from '../editor/language';

export default function GitDiff({ session, workspaceId, dark, locked, vimEnabled, onView }: {
  session: DocumentSession; workspaceId?: number; dark: boolean; locked: boolean; vimEnabled: boolean; onView: (view: EditorView | null) => void;
}) {
  const host = useRef<HTMLDivElement>(null), view = useRef<MergeView>();
  const appearance = useRef(new Compartment()), editable = useRef(new Compartment()), vimKeys = useRef(new Compartment());
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [refresh, setRefresh] = useState(0);
  const [baseline, setBaseline] = useState<{ contents: string; revision: string | null; isNew: boolean }>();
  const [changes, setChanges] = useState(0), [index, setIndex] = useState(-1);
  useEffect(() => {
    let cancelled = false; setLoading(true); setError(''); setBaseline(undefined);
    if (!workspaceId) { setError('Open a file in a Git repository to review its changes.'); setLoading(false); return; }
    void api.baseline(workspaceId, session.path).then(value => { if (!cancelled) setBaseline(value); }).catch(error => { if (!cancelled) setError(String(error)); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session, workspaceId, refresh]);
  useEffect(() => {
    if (!baseline || !host.current) return;
    let replacing = false;
    const compact = EditorView.theme({
      '&': { background: 'var(--editor)', color: 'var(--text)', fontSize: '12px' },
      '.cm-content': { padding: '18px 0 50px' }, '.cm-line': { padding: '0 18px' },
      '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.8' },
      '.cm-gutters': { background: 'var(--panel)', color: 'var(--line-number)', border: 'none' },
    });
    const merge = new MergeView({ parent: host.current,
      a: { doc: baseline.contents, extensions: [EditorState.readOnly.of(true), EditorView.editable.of(false), editingExtensions(), compact,
        appearance.current.of(EditorView.theme({}, { dark })), EditorView.contentAttributes.of({ 'aria-label': 'Git HEAD version' })] },
      b: { doc: session.text, extensions: [vimKeys.current.of([]), compact, editingExtensions(),
        appearance.current.of(EditorView.theme({}, { dark })), editable.current.of(EditorState.readOnly.of(locked)),
        EditorView.contentAttributes.of({ 'aria-label': 'Current file in Git diff', spellcheck: 'false' }),
        EditorView.updateListener.of(update => {
          if (!update.docChanged) return;
          if (!replacing) session.edit(update.state.doc.toString());
          setChanges(merge.chunks.length); setIndex(-1);
        }),
      ] }, gutter: true, highlightChanges: true, collapseUnchanged: { margin: 4, minSize: 12 }, diffConfig: { scanLimit: 1000, timeout: 100 } });
    const stopLanguages = [configureLanguage(merge.a, session.path), configureLanguage(merge.b, session.path)];
    view.current = merge; onView(merge.b); setChanges(merge.chunks.length); setIndex(-1);
    const off = session.subscribe(kind => {
      if (kind === 'status' || session.text === merge.b.state.doc.toString()) return;
      replacing = true;
      try { syncDocument(merge.b, session.text, kind === 'edit'); } finally { replacing = false; }
    });
    return () => { stopLanguages.forEach(stop => stop()); off(); view.current = undefined; onView(null); merge.destroy(); };
  }, [baseline, session]);
  useEffect(() => {
    for (const pane of [view.current?.a, view.current?.b]) pane?.dispatch({ effects: appearance.current.reconfigure(EditorView.theme({}, { dark })) });
  }, [dark, baseline, session]);
  useLayoutEffect(() => { view.current?.b.dispatch({ effects: editable.current.reconfigure(EditorState.readOnly.of(locked)) }); }, [locked, baseline, session]);
  useEffect(() => {
    const pane = view.current?.b;
    if (pane) return configureVim(pane, vimKeys.current, session, vimEnabled);
  }, [vimEnabled, baseline, session]);
  function navigate(direction: number) {
    const merge = view.current; if (!merge?.chunks.length) return;
    const next = (index + direction + merge.chunks.length) % merge.chunks.length; setIndex(next);
    const chunk = merge.chunks[next];
    merge.a.dispatch({ effects: EditorView.scrollIntoView(Math.min(chunk.fromA, merge.a.state.doc.length), { y: 'center' }) });
    merge.b.dispatch({ effects: EditorView.scrollIntoView(Math.min(chunk.fromB, merge.b.state.doc.length), { y: 'center' }) });
  }
  return <section class="git-diff" aria-label="Git diff">
    <div class="git-toolbar"><span>{loading ? 'Reading Git…' : error ? 'Git diff' : changes ? `${changes} changed ${changes === 1 ? 'block' : 'blocks'}` : 'No changes from HEAD'}</span><div><button disabled={!changes} title="Previous change" aria-label="Previous change" onClick={() => navigate(-1)}>↑</button><button disabled={!changes} title="Next change" aria-label="Next change" onClick={() => navigate(1)}>↓</button><button class="icon-button" title="Refresh Git diff" aria-label="Refresh Git diff" onClick={() => setRefresh(n => n + 1)}><Icon name="refresh" size={14} /></button></div></div>
    {error ? <div class="git-empty"><Icon name="diff" size={30} /><p>{error}</p></div> : <><div class="diff-labels"><span>{baseline?.isNew ? 'NEW FILE' : `HEAD ${baseline?.revision?.slice(0, 7) || ''}`}</span><span>CURRENT FILE</span></div><div class="diff-host" ref={host} /></>}
  </section>;
}
