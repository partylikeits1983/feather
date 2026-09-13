import { Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

/** Apply an edit from another view without replacing unchanged text or moving its cursor. */
export function syncDocument(view: EditorView, text: string, addToHistory: boolean) {
  const before = view.state.doc.toString();
  if (before === text) return;
  let from = 0, to = before.length, end = text.length;
  while (from < to && from < end && before.charCodeAt(from) === text.charCodeAt(from)) from++;
  while (to > from && end > from && before.charCodeAt(to - 1) === text.charCodeAt(end - 1)) { to--; end--; }
  view.dispatch({ changes: { from, to, insert: text.slice(from, end) }, annotations: Transaction.addToHistory.of(addToHistory) });
}
