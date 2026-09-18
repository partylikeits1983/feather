import { describe, expect, it } from 'vitest';
import { normalizeMath, renderMarkdown } from '../frontend/src/preview/markdown';
import { textOffsets } from '../frontend/src/preview/source-map';

describe('Markdown source mapping', () => {
  it('preserves original UTF-16 positions through math normalization and Unicode', () => {
    const source = '🐦 before \\(x\\) after\n\n\\[a=b\\] tail\n\n```text\n🐦 code\n```';
    const normalized = normalizeMath(source);
    expect(normalized.offsets).toHaveLength(normalized.text.length + 1);
    for (const text of ['🐦 before', ' after', ' tail', '🐦 code']) {
      const start = normalized.text.indexOf(text);
      expect(normalized.offsets.slice(start, start + text.length)).toEqual(Array.from({ length: text.length }, (_, index) => source.indexOf(text) + index));
    }
  });

  it('maps escaped punctuation, entities and literal code back to their original characters', () => {
    const raw = 'A &amp; B \\*word\\* &#x1F426;';
    const positions = textOffsets('A & B *word* 🐦', raw, 10);
    expect(positions[2]).toBe(12);
    expect(positions[3]).toBe(17);
    expect(positions[6]).toBe(20);
    expect(positions.at(-1)).toBe(raw.length + 10);
    expect(textOffsets('&amp;', '&amp;', 0, true)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('maps repeated text to its own paragraph and code past its fence label', async () => {
    const source = 'Same **bold**.\n\nSame **bold**.\n\n```rust\nrust\n```';
    const { html } = await renderMarkdown(source);
    const first = source.indexOf('bold'), second = source.lastIndexOf('bold'), code = source.lastIndexOf('rust');
    expect(html).toContain(`data-source-start="${first}" data-source-end="${first + 4}" data-source-text="">bold`);
    expect(html).toContain(`data-source-start="${second}" data-source-end="${second + 4}" data-source-text="">bold`);
    expect(html).toContain(`data-source-start="${code}" data-source-end="${code + 5}" data-source-text=""`);
  });

  it('keeps source bounds on rendered formulas', async () => {
    const { html } = await renderMarkdown('Before $x^2$ after.\n\n$$y$$');
    expect(html).toContain('data-source-start="7" data-source-end="12" data-source-atomic=""');
    expect(html).toContain('data-source-atomic=""');
    expect(html).toContain('class="katex"');
  });
});
