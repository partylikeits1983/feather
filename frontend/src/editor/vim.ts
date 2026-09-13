import type { Compartment } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { DocumentSession } from '../state/document';

export function configureVim(view: EditorView, keys: Compartment, session: DocumentSession, enabled: boolean) {
  let cancelled = false;
  if (!enabled) view.dispatch({ effects: keys.reconfigure([]) });
  else void import('@replit/codemirror-vim').then(({ vim, Vim }) => {
    if (cancelled) return;
    Vim.defineEx('write', 'w', () => { void session.flush().catch(() => {}); });
    view.dispatch({ effects: keys.reconfigure(vim({ status: true })) });
  });
  return () => { cancelled = true; };
}
