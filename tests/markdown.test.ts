import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../frontend/src/preview/markdown';
import { resolveRelative } from '../frontend/src/types';
import { readFileSync } from 'node:fs';

describe('preview', () => {
  it('renders GFM, headings and source positions', async () => {
    const { html } = await renderMarkdown('# Title\n\n- [x] done\n\n| A | B |\n| - | - |\n| 1 | 2 |');
    expect(html).toContain('data-source-line="1"'); expect(html).toContain('id="title"'); expect(html).toContain('<table'); expect(html).toContain('type="checkbox"');
  });
  it.each(['$x^2$', '$$\nx^2\n$$', '\\(x^2\\)', '\\[x^2\\]', '```math\nx^2\n```', '$$\n\\begin{aligned}a &= b\\\\ c &= d\\end{aligned}\n$$', '\\begin{aligned}\na &= b\n\\end{aligned}'])('renders math: %s', async input => {
    const { html } = await renderMarkdown(input); expect(html).toContain('class="katex"'); expect(html).not.toContain('katex-error');
  });
  it('leaves math inside code alone', async () => {
    const { html } = await renderMarkdown('`\\(literal\\)`\n\n```text\n\\[literal\\]\n```');
    expect(html).not.toContain('class="katex"'); expect(html).toContain('\\(literal\\)');
  });
  it('renders multiline dollar equations without consuming the following paragraphs', async () => {
    const source = readFileSync(new URL('./fixtures/from-codes-to-proofs.md', import.meta.url), 'utf8');
    const { html } = await renderMarkdown(source);
    expect(html).not.toContain('katex-error');
    expect(html.match(/class="katex-display"/g)?.length).toBeGreaterThanOrEqual(4);
    expect(html).toMatch(/<p[^>]*>All arithmetic is in the finite field/);
    expect(html).toContain('id="distance-and-lists-in-soundness"');
    expect(html).toContain('href="https://eccc.weizmann.ac.il/report/2019/044/"');
    const line = source.split('\n').findIndex(line => line.startsWith('## Distance')) + 1;
    expect(html).toContain(`<h2 data-source-line="${line}"`);
  });
  it('handles text after closing math and leaves escaped dollars and code untouched', async () => {
    const { html } = await renderMarkdown('$$ x+\ny $$ After the equation.\n\n`$$code$$` and \\$\\$literal\n\n```text\n$$code\nmore$$\n```');
    expect(html.match(/class="katex-display"/g)).toHaveLength(1);
    expect(html).not.toContain('katex-error');
    expect(html).toMatch(/<p[^>]*>After the equation/);
    expect(html).toContain('<code>$$code$$</code>');
    expect(html).toContain('$$literal');
  });
  it('does not execute raw HTML or load remote images and unsafe links', async () => {
    const { html } = await renderMarkdown('<script>alert(1)</script>\n\n[bad](javascript:alert)\n\n![remote](https://example.com/a.png)\n\n![local](./image.svg)');
    expect(html).not.toContain('<script'); expect(html).not.toContain('href="javascript:'); expect(html).not.toContain('src="https:'); expect(html).toContain('data-local-image="./image.svg"');
  });
  it('bounds large previews', async () => { expect((await renderMarkdown('word '.repeat(40_000))).truncated).toBe(true); });
  it('exports the complete document beyond the live preview boundary', async () => { const result = await renderMarkdown('word '.repeat(40_000) + '\n\n# Final page', Infinity); expect(result.truncated).toBe(false); expect(result.html).toContain('Final page'); });
});

it('resolves local links within the folder, including encoded traversal', () => {
  expect(resolveRelative('notes/a.md', '../proof.md')).toBe('proof.md');
  expect(resolveRelative('notes/a.md', './figures/a.svg')).toBe('notes/figures/a.svg');
  expect(() => resolveRelative('a.md', '%2e%2e/secret.md')).toThrow();
  expect(() => resolveRelative('a.md', 'file:///etc/passwd')).toThrow();
});
