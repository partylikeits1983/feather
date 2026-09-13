import { Prec, type Compartment } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { DocumentSession } from '../state/document';

// Vim handles mode transitions first. A further Escape in Normal must not
// become WebKit's default action to leave macOS fullscreen.
const keepEscapeInEditor = Prec.lowest(EditorView.domEventHandlers({
  keydown(event, view) {
    if (event.key !== 'Escape' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.isComposing) return false;
    if (!view.contentDOM.contains(event.target as Node)) return false;
    event.preventDefault(); event.stopPropagation(); return true;
  },
}));

export function configureVim(view: EditorView, keys: Compartment, session: DocumentSession, enabled: boolean) {
  let cancelled = false;
  if (!enabled) view.dispatch({ effects: keys.reconfigure([]) });
  else void import('@replit/codemirror-vim').then(({ vim, Vim }) => {
    if (cancelled) return;
    Vim.defineEx('write', 'w', () => { void session.flush().catch(() => {}); });
    view.dispatch({ effects: keys.reconfigure([vim({ status: true }), keepEscapeInEditor]) });
  });
  return () => { cancelled = true; };
}
