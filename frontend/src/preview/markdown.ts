import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';
import type { Root, Element } from 'hast';
import { highlightCodeBlocks } from '../syntax/highlight';

export const PREVIEW_LIMIT = 180_000;

/** Normalize TeX delimiters without rewriting fenced/inline code. Preserve a source-line map. */
export function normalizeMath(source: string) {
  const output: string[] = [], lines: number[] = [];
  let fence = '', display = '', code = '';
  let offset = 0;
  const input = source.split('\n');
  input.forEach((line, index) => {
    const lineOffset = offset; offset += line.length + 1;
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (!display && !code && marker && (!fence || (marker[0] === fence[0] && marker.length >= fence.length))) {
      fence = fence ? '' : marker; output.push(line); lines.push(index + 1); return;
    }
    if (fence || (!display && /^( {4}|\t)/.test(line))) { output.push(line); lines.push(index + 1); return; }
    let result = '';
    if (!display && !code && line.trim().startsWith('\\begin{aligned}')) { result = '$$\n'; display = 'aligned'; }
    for (let i = 0; i < line.length;) {
      if (!display && line[i] === '`') {
        const run = /^`+/.exec(line.slice(i))![0];
        if (code === run) code = '';
        else if (!code) {
          // An unmatched backtick is ordinary Markdown text, not a code span.
          const rest = source.slice(lineOffset + i + run.length);
          if (new RegExp(`(?<!\u0060)\u0060{${run.length}}(?!\u0060)`).test(rest)) code = run;
        }
        result += run; i += run.length; continue;
      }
      if (code) { result += line[i++]; continue; }
      const pair = line.slice(i, i + 2);
      if (pair === '$$' && (!display || display === 'dollar')) {
        // remark-math requires display delimiters on separate lines. Accept the
        // common TeX style: $$ equation\ncontinued $$, without eating later prose.
        result += display ? '\n$$\n\n' : `${result.trim() ? '\n\n' : ''}$$\n`;
        display = display ? '' : 'dollar'; i += 2; continue;
      }
      if (pair === '\\[' && !display) { result += `${result.trim() ? '\n\n' : ''}$$\n`; display = 'bracket'; i += 2; continue; }
      if (pair === '\\]' && display === 'bracket') { result += '\n$$\n\n'; display = ''; i += 2; continue; }
      if (!display && (pair === '\\(' || pair === '\\)')) { result += '$'; i += 2; continue; }
      if (line[i] === '\\' && i + 1 < line.length) { result += pair; i += 2; continue; }
      result += line[i++];
    }
    if (display === 'aligned' && line.includes('\\end{aligned}')) { result += '\n$$'; display = ''; }
    for (const generated of result.split('\n')) { output.push(generated); lines.push(index + 1); }
  });
  return { text: output.join('\n'), lines };
}

function prepareHtml() {
  return (tree: Root, file: { data: Record<string, unknown> }) => {
    const lines = file.data.sourceLines as number[];
    const slugs = new Map<string, number>();
    visit(tree, 'element', (node: Element) => {
      if (/^(h[1-6]|p|pre|blockquote|ul|ol|table|hr|div)$/.test(node.tagName) && node.position) {
        node.properties['data-source-line'] = lines[node.position.start.line - 1] || node.position.start.line;
      }
      if (/^h[1-6]$/.test(node.tagName)) {
        let text = ''; visit(node, 'text', n => { text += n.value; });
        const slug = text.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s+/g, '-');
        const count = slugs.get(slug) || 0; slugs.set(slug, count + 1);
        node.properties.id = count ? `${slug}-${count}` : slug;
      }
      if (node.tagName === 'a') {
        const href = String(node.properties.href || '');
        if (/^[a-z][a-z\d+.-]*:/i.test(href) && !/^(https?:|mailto:)/i.test(href)) delete node.properties.href;
        if (href.startsWith('//')) delete node.properties.href;
      }
      if (node.tagName === 'img') {
        const src = String(node.properties.src || '');
        delete node.properties.src;
        node.properties.loading = 'lazy';
        if (!/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(src)) node.properties['data-local-image'] = src;
        else node.properties.alt = `${node.properties.alt || 'Image'} (remote images are disabled)`;
      }
    });
  };
}

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkMath)
  .use(remarkRehype).use(prepareHtml).use(highlightCodeBlocks).use(rehypeKatex, { trust: false, strict: 'ignore', maxExpand: 1000, maxSize: 20 })
  .use(rehypeStringify);

export async function renderMarkdown(source: string, limit = PREVIEW_LIMIT) {
  const truncated = source.length > limit;
  const limited = truncated ? source.slice(0, limit).replace(/\n[^\n]*$/, '') : source;
  const normalized = normalizeMath(limited);
  const result = await processor.process({ value: normalized.text, data: { sourceLines: normalized.lines } });
  return { html: String(result), truncated };
}
