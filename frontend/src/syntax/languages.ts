import { LanguageDescription, LanguageSupport, StreamLanguage } from '@codemirror/language';
import { codeLanguage, type CodeLanguage } from './language-names';
import { isMarkdown, isTex } from '../types';

// Shared by the editor and preview worker. Imports become local, on-demand chunks.
const languages = {
  rust: LanguageDescription.of({ name: 'Rust', extensions: ['rs'], load: () => import('@codemirror/lang-rust').then(m => m.rust()) }),
  typescript: LanguageDescription.of({ name: 'TypeScript', extensions: ['ts', 'mts', 'cts'], load: () => import('@codemirror/lang-javascript').then(m => m.javascript({ typescript: true })) }),
  tsx: LanguageDescription.of({ name: 'TSX', extensions: ['tsx'], load: () => import('@codemirror/lang-javascript').then(m => m.javascript({ typescript: true, jsx: true })) }),
  javascript: LanguageDescription.of({ name: 'JavaScript', extensions: ['js', 'mjs', 'cjs'], load: () => import('@codemirror/lang-javascript').then(m => m.javascript()) }),
  jsx: LanguageDescription.of({ name: 'JSX', extensions: ['jsx'], load: () => import('@codemirror/lang-javascript').then(m => m.javascript({ jsx: true })) }),
  python: LanguageDescription.of({ name: 'Python', extensions: ['py', 'pyw', 'pyi'], load: () => import('@codemirror/lang-python').then(m => m.python()) }),
  lean: LanguageDescription.of({ name: 'Lean', extensions: ['lean'], load: () => import('./lean').then(m => new LanguageSupport(m.leanLanguage)) }),
  c: LanguageDescription.of({ name: 'C', extensions: ['c', 'h'], load: () => import('@codemirror/legacy-modes/mode/clike').then(m => new LanguageSupport(StreamLanguage.define(m.c))) }),
};
const markdownLanguage = LanguageDescription.of({ name: 'Markdown', load: () => import('@codemirror/lang-markdown').then(m => m.markdown({ codeLanguages: fencedLanguage })) });
const texLanguage = LanguageDescription.of({ name: 'TeX', load: () => import('@codemirror/legacy-modes/mode/stex').then(m => new LanguageSupport(StreamLanguage.define(m.stex))) });

export function fileLanguage(path: string) {
  if (isMarkdown(path)) return markdownLanguage;
  if (isTex(path)) return texLanguage;
  return LanguageDescription.matchFilename(Object.values(languages), path.toLowerCase());
}
export function fencedLanguage(info: string) {
  const language = codeLanguage(info);
  return language ? languages[language] : null;
}

export async function loadCodeLanguage(language: CodeLanguage) {
  return (await languages[language].load()).language;
}
