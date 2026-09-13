export type CodeLanguage = 'rust' | 'typescript' | 'tsx' | 'javascript' | 'jsx' | 'python' | 'lean' | 'c';
const aliases: Record<string, CodeLanguage> = {
  rust: 'rust', rs: 'rust', typescript: 'typescript', ts: 'typescript', tsx: 'tsx',
  javascript: 'javascript', js: 'javascript', jsx: 'jsx', python: 'python', py: 'python',
  lean: 'lean', lean4: 'lean', c: 'c', h: 'c',
};
const plain = new Set(['', 'text', 'txt', 'plain', 'plaintext', 'none', 'math']);

export function codeLanguage(info: string): CodeLanguage | null {
  const name = info.trim().split(/\s+/)[0].toLowerCase();
  return plain.has(name) ? null : Object.hasOwn(aliases, name) ? aliases[name] : 'c';
}
