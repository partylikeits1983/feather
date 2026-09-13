import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { ensureSyntaxTree } from '@codemirror/language';
import { markdown } from '@codemirror/lang-markdown';
import { highlightTree } from '@lezer/highlight';
import { renderMarkdown } from '../frontend/src/preview/markdown';
import { codeLanguage, type CodeLanguage } from '../frontend/src/syntax/language-names';
import { fencedLanguage, loadCodeLanguage } from '../frontend/src/syntax/languages';
import { codeHighlighter } from '../frontend/src/syntax/highlighter';

const examples: [string, CodeLanguage, string, string][] = [
  ['rust', 'rust', 'fn', 'fn square(x: i32) -> i32 { x * x }'],
  ['ts', 'typescript', 'const', 'const name: string = "Feather";'],
  ['py', 'python', 'def', 'def square(x: int):\n    return x * x'],
  ['lean4', 'lean', 'theorem', 'theorem refl (α : Nat) : α = α := by rfl'],
  ['somelang', 'c', 'return', 'int square(int x) { return x * x; }'],
];

describe('code highlighting', () => {
  it.each(examples)('highlights %s with matching editor and preview rules', async (label, language, keyword, code) => {
    const source = '```' + label + '\n' + code + '\n```';
    const { html } = await renderMarkdown(source);
    expect(html).toContain(`data-code-language="${language}"`);
    expect(html).toContain(`<span class="syntax-keyword">${keyword}</span>`);
    expect(html).toContain('data-source-line="1"');
    await loadCodeLanguage(language);
    const state = EditorState.create({ doc: source, extensions: [markdown({ codeLanguages: fencedLanguage })] });
    const tokens: { text: string; classes: string }[] = [];
    highlightTree(ensureSyntaxTree(state, source.length, 100)!, codeHighlighter,
      (from, to, classes) => tokens.push({ text: source.slice(from, to), classes }));
    expect(tokens).toContainEqual({ text: keyword, classes: 'syntax-keyword' });
  });

  it('uses C for unknown labels and keeps explicit text and math plain', async () => {
    for (const label of ['somelang', 'constructor', '__proto__', 'made-up']) expect(codeLanguage(label)).toBe('c');
    expect(codeLanguage('RUST title="example"')).toBe('rust');
    for (const label of ['', 'text', 'txt', 'plain', 'plaintext', 'none', 'math']) expect(codeLanguage(label)).toBeNull();
    const { html } = await renderMarkdown('```text\nint main() { return 0; }\n```\n\n```\nfn main() {}\n```\n\n`let value = 1`');
    expect(html).not.toContain('syntax-');
    expect(html).not.toContain('data-code-language');
  });

  it('preserves nested Lean comments, Unicode names, primed identifiers, and escaped strings', async () => {
    const source = '/- outside\n/- inside -/\nstill outside -/\ndef α\' : String := "hello \\"quoted\\""\n#check α\'';
    const language = await loadCodeLanguage('lean');
    const tokens: { text: string; classes: string }[] = [];
    highlightTree(language.parser.parse(source), codeHighlighter,
      (from, to, classes) => tokens.push({ text: source.slice(from, to), classes }));
    expect(tokens.filter(token => token.classes === 'syntax-comment').map(token => token.text).join('')).toContain('still outside -/');
    expect(tokens).toContainEqual({ text: 'def', classes: 'syntax-keyword' });
    expect(tokens).toContainEqual({ text: "α'", classes: 'syntax-function' });
    expect(tokens).toContainEqual({ text: '#check', classes: 'syntax-meta' });
    expect(tokens.find(token => token.classes === 'syntax-string')?.text).toContain('quoted');
  });

  it('escapes code as text and retains math outside highlighted fences', async () => {
    const { html } = await renderMarkdown('```typescript\nconst html = "<script>alert(1)</script> & text";\n```\n\n$\\alpha^2$');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&#x3C;script>');
    expect(html).toContain('class="katex"');
    expect(html).not.toContain('katex-error');
  });

  it('handles concurrent edits and exports without retaining stale snippets', async () => {
    const documents = [1, 2, 1].map(value => '```rust\nlet value = ' + value + ';\n```');
    const renders = await Promise.all(documents.map(source => renderMarkdown(source, Infinity)));
    expect(renders[0].html).toContain('syntax-number">1</span>');
    expect(renders[1].html).toContain('syntax-number">2</span>');
    expect(renders[2].html).toBe(renders[0].html);
  });
});
