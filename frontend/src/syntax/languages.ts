import { LanguageDescription, LanguageSupport, StreamLanguage } from '@codemirror/language';
import { codeLanguage, type CodeLanguage } from './language-names';

// Shared by the editor and preview worker. Imports become local, on-demand chunks.
const languages = {
  rust: LanguageDescription.of({ name: 'Rust', load: () => import('@codemirror/lang-rust').then(m => m.rust()) }),
  typescript: LanguageDescription.of({ name: 'TypeScript', load: () => import('@codemirror/lang-javascript').then(m => m.javascript({ typescript: true })) }),
  tsx: LanguageDescription.of({ name: 'TSX', load: () => import('@codemirror/lang-javascript').then(m => m.javascript({ typescript: true, jsx: true })) }),
  javascript: LanguageDescription.of({ name: 'JavaScript', load: () => import('@codemirror/lang-javascript').then(m => m.javascript()) }),
  jsx: LanguageDescription.of({ name: 'JSX', load: () => import('@codemirror/lang-javascript').then(m => m.javascript({ jsx: true })) }),
  python: LanguageDescription.of({ name: 'Python', load: () => import('@codemirror/lang-python').then(m => m.python()) }),
  lean: LanguageDescription.of({ name: 'Lean', load: () => import('./lean').then(m => new LanguageSupport(m.leanLanguage)) }),
  c: LanguageDescription.of({ name: 'C', load: () => import('@codemirror/legacy-modes/mode/clike').then(m => new LanguageSupport(StreamLanguage.define(m.c))) }),
};
export function fencedLanguage(info: string) {
  const language = codeLanguage(info);
  return language ? languages[language] : null;
}

export async function loadCodeLanguage(language: CodeLanguage) {
  return (await languages[language].load()).language;
}
