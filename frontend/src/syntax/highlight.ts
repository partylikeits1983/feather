import { highlightTree } from '@lezer/highlight';
import type { Element, ElementContent, Root } from 'hast';
import { visit } from 'unist-util-visit';
import { codeLanguage, type CodeLanguage } from './language-names';
import { codeHighlighter } from './highlighter';

interface Span { from: number; to: number; classes: string }
// Reuse unchanged snippets while editing surrounding prose; bound retained text.
const cache = new Map<string, Span[]>();
let cachedCharacters = 0;
async function spansFor(source: string, language: CodeLanguage) {
  const key = language + '\0' + source;
  const cached = cache.get(key);
  if (cached) { cache.delete(key); cache.set(key, cached); return cached; }
  // Ordinary Markdown/math doesn't initialize CodeMirror in the preview worker.
  const { loadCodeLanguage } = await import('./languages');
  const parser = (await loadCodeLanguage(language)).parser;
  const spans: Span[] = [];
  highlightTree(parser.parse(source), codeHighlighter, (from, to, classes) => spans.push({ from, to, classes }));
  if (key.length <= 100_000) {
    while (cache.size && (cache.size >= 32 || cachedCharacters + key.length > 200_000)) {
      const first = cache.keys().next().value!;
      cachedCharacters -= first.length; cache.delete(first);
    }
    // Another concurrent render may have cached this same snippet while loading.
    if (!cache.has(key)) { cache.set(key, spans); cachedCharacters += key.length; }
  }
  return spans;
}

async function highlightBlock(pre: Element, code: Element, language: CodeLanguage) {
  const source = code.children.map(child => child.type === 'text' ? child.value : '').join('');
  const spans = await spansFor(source, language);
  const children: ElementContent[] = [];
  let position = 0;
  for (const { from, to, classes } of spans) {
    if (from > position) children.push({ type: 'text', value: source.slice(position, from) });
    children.push({ type: 'element', tagName: 'span', properties: { className: classes.split(' ') }, children: [{ type: 'text', value: source.slice(from, to) }] });
    position = to;
  }
  if (position < source.length) children.push({ type: 'text', value: source.slice(position) });
  code.children = children;
  pre.properties['data-code-language'] = language;
}

export function highlightCodeBlocks() {
  return async (tree: Root) => {
    const work: Promise<void>[] = [];
    visit(tree, 'element', pre => {
      if (pre.tagName !== 'pre') return;
      const code = pre.children[0];
      if (code?.type !== 'element' || code.tagName !== 'code') return;
      const className = (code.properties.className as string[] | undefined)?.find(name => name.startsWith('language-'));
      const language = codeLanguage(className?.slice(9) || '');
      if (language) work.push(highlightBlock(pre, code, language));
    });
    await Promise.all(work);
  };
}
