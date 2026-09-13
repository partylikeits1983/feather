import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { markdown } from '@codemirror/lang-markdown';
import { tags } from '@lezer/highlight';
import type { DocumentSession } from '../state/document';
import { syncDocument } from './sync';
import { configureVim } from './vim';
import { fencedLanguage } from '../syntax/languages';
import { codeHighlighter } from '../syntax/highlighter';

const colors = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--accent)', fontWeight: '600' },
  { tag: tags.strong, fontWeight: '600', color: 'var(--text)' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.link, color: 'var(--accent)', textDecoration: 'underline' },
  { tag: tags.url, color: 'var(--muted)' },
  { tag: tags.monospace, color: 'var(--code)' },
  { tag: tags.quote, color: 'var(--muted)' },
  { tag: tags.processingInstruction, color: 'var(--muted)' },
  { tag: tags.meta, color: 'var(--muted)' },
]);
const theme = EditorView.theme({
  '&': { height: '100%', background: 'var(--editor)', color: 'var(--text)', fontSize: '13px' },
  '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.85', overflow: 'auto' },
  '.cm-content': { padding: '28px 0 100px', caretColor: 'var(--accent)' },
  '.cm-line': { padding: '0 28px 0 14px' },
  '.cm-gutters': { background: 'var(--editor)', color: 'var(--line-number)', border: 'none', paddingLeft: '14px', fontSize: '11px' },
  '.cm-lineNumbers .cm-gutterElement': { minWidth: '24px', padding: '0 7px' },
  '.cm-activeLine, .cm-activeLineGutter': { background: 'var(--active-line)' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)' },
  '&.cm-focused': { outline: 'none' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { background: 'var(--selection) !important' },
  '.cm-panels': { background: 'var(--panel)', color: 'var(--text)', borderColor: 'var(--border)' },
  '.cm-search input, .cm-search button': { fontFamily: 'inherit', color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px' },
  '.cm-tooltip': { background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)' },
});

export function editingExtensions() {
  return [lineNumbers(), history(), drawSelection(), highlightActiveLine(), highlightActiveLineGutter(), bracketMatching(), highlightSelectionMatches(),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]), markdown({ codeLanguages: fencedLanguage }), syntaxHighlighting(colors), syntaxHighlighting(codeHighlighter), theme, EditorView.lineWrapping];
}

export function Editor({ session, dark, locked, vimEnabled, onView, onScroll }: { session: DocumentSession; dark: boolean; locked: boolean; vimEnabled: boolean; onView: (view: EditorView | null) => void; onScroll: (line: number) => void }) {
  const host = useRef<HTMLDivElement>(null), viewRef = useRef<EditorView>();
  const appearance = useRef(new Compartment());
  const editable = useRef(new Compartment());
  const vimKeys = useRef(new Compartment());
  const scrollHandler = useRef(onScroll); scrollHandler.current = onScroll;
  useEffect(() => {
    let replacing = false;
    const view = new EditorView({ parent: host.current!, state: EditorState.create({ doc: session.text, extensions: [
      vimKeys.current.of([]), editingExtensions(), appearance.current.of(EditorView.theme({}, { dark })),
      editable.current.of(EditorState.readOnly.of(locked)),
      EditorView.contentAttributes.of({ 'aria-label': 'Markdown source', spellcheck: 'false' }),
      EditorView.updateListener.of(update => { if (update.docChanged && !replacing) session.edit(update.state.doc.toString()); }),
      EditorView.domEventHandlers({ scroll: (_event, view) => {
        const block = view.lineBlockAtHeight(view.scrollDOM.scrollTop);
        scrollHandler.current(view.state.doc.lineAt(block.from).number);
      } }),
    ] }) });
    viewRef.current = view; onView(view);
    const off = session.subscribe(kind => {
      if (kind !== 'status' && session.text !== view.state.doc.toString()) {
        replacing = true;
        try { syncDocument(view, session.text, kind === 'edit'); } finally { replacing = false; }
      }
    });
    return () => { off(); onView(null); view.destroy(); };
  }, [session]);
  useEffect(() => { viewRef.current?.dispatch({ effects: appearance.current.reconfigure(EditorView.theme({}, { dark })) }); }, [dark]);
  useLayoutEffect(() => { viewRef.current?.dispatch({ effects: editable.current.reconfigure(EditorState.readOnly.of(locked)) }); }, [locked]);
  useEffect(() => {
    const view = viewRef.current;
    if (view) return configureVim(view, vimKeys.current, session, vimEnabled);
  }, [vimEnabled, session]);
  return <div class="editor-host" ref={host} />;
}
