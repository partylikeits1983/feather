import { Compartment, StateEffect } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { fileLanguage } from '../syntax/languages';

// Load bundled parsers without recreating the editor or losing edits and undo.
export function configureLanguage(view: EditorView, path: string) {
  const language = fileLanguage(path), compartment = new Compartment();
  let cancelled = false;
  view.dispatch({ effects: StateEffect.appendConfig.of(compartment.of(language?.support || [])) });
  if (language && !language.support) void language.load().then(support => {
    if (!cancelled) view.dispatch({ effects: compartment.reconfigure(support) });
  }).catch(error => console.error(`Could not load highlighting for ${path}`, error));
  return () => { cancelled = true; };
}
