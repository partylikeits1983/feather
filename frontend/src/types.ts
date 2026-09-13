export interface Workspace { id: number; root: string; name: string; selected: string | null; watchWarning: string | null }
export interface Entry { name: string; path: string; isDir: boolean }
export interface Document { path: string; contents: string; version: string }
export type Appearance = 'system' | 'light' | 'dark';
export const isText = (path: string) => /\.(md|markdown|mdown|txt|tex)$/i.test(path);
export const basename = (path: string) => path.split('/').pop() || path;
export const dirname = (path: string) => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';

export function resolveRelative(current: string, href: string): string {
  const decoded = decodeURIComponent(href.split(/[?#]/)[0]);
  if (/^[a-z][a-z\d+.-]*:/i.test(decoded) || decoded.startsWith('/') || decoded.startsWith('\\')) throw new Error('This path is outside the opened folder');
  const parts = dirname(current).split('/').filter(Boolean);
  for (const part of decoded.split('/')) {
    if (part === '..') { if (!parts.length) throw new Error('This path is outside the opened folder'); parts.pop(); }
    else if (part && part !== '.') parts.push(part);
  }
  return parts.join('/');
}
