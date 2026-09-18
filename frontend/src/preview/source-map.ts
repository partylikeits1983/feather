import type { Element, Root, Text } from 'hast';
import { decodeString } from 'micromark-util-decode-string';

/** Map rendered UTF-16 offsets to source, retaining escapes, entities and code delimiters. */
export function textOffsets(value: string, raw: string, start: number, literal = false): number[] {
  const decoded: string[] = [], positions: number[] = [];
  for (let i = 0; i < raw.length;) {
    const token = !literal && (raw[i] === '\\' || raw[i] === '&') ? /^(?:\\[!-/:-@\[-`{-~]|&(?:#\d+|#x[\da-f]+|[\da-z]+);)/i.exec(raw.slice(i))?.[0] : undefined;
    const text = token ? decodeString(token) : raw[i];
    for (let j = 0; j < text.length; j++) { decoded.push(text[j]); positions.push(start + i); }
    i += token?.length || 1;
  }
  const plain = decoded.join('');
  const offsets: number[] = [];
  let cursor = 0;
  for (let i = 0; i < value.length; i++) {
    let next = plain.indexOf(value[i], cursor);
    if (value[i] === ' ' && /[\r\n]/.test(plain[cursor] || '')) next = cursor;
    if (next < 0) next = cursor;
    offsets.push(positions[next] ?? start + raw.length);
    cursor = next + 1;
  }
  offsets.push(positions[cursor] ?? start + raw.length);
  return offsets;
}

export function mapSourceText() {
  return (tree: Root, file: { data: Record<string, unknown> }) => {
    if (!file.data.sourceOffsets) return;
    const source = file.data.source as string, offsets = file.data.sourceOffsets as number[];
    const bounds = (node: Element | Text) => {
      const from = node.position?.start.offset, to = node.position?.end.offset;
      return from === undefined || to === undefined ? null : { from: offsets[from], to: offsets[to] };
    };
    const map = (node: Element, value: string, range: { from: number; to: number }, literal = false) => {
      const positions = textOffsets(value, source.slice(range.from, range.to), range.from, literal);
      node.properties['data-source-start'] = positions[0];
      node.properties['data-source-end'] = positions[positions.length - 1];
      node.properties['data-source-text'] = '';
      if (positions.some((offset, index) => offset !== positions[0] + index)) node.properties['data-source-map'] = JSON.stringify(positions);
    };
    const walk = (parent: Root | Element) => {
      parent.children = parent.children.map(child => {
        if (child.type === 'element') {
          const range = bounds(child);
          if (range) { child.properties['data-source-start'] = range.from; child.properties['data-source-end'] = range.to; }
          const math = child.tagName === 'pre' ? child.children[0] : child;
          if (math?.type === 'element' && math.tagName === 'code' && (math.properties.className as string[] | undefined)?.some(name => /(?:language-math|math-inline|math-display)/.test(name))) {
            return { type: 'element', tagName: child.tagName === 'pre' ? 'div' : 'span', properties: { 'data-source-start': range?.from, 'data-source-end': range?.to, 'data-source-atomic': '', 'data-source-line': child.properties['data-source-line'] }, children: [child] } as Element;
          }
          if (child.tagName === 'code') {
            if (range && !(child.properties.className as string[] | undefined)?.some(name => /(?:language-math|math-inline|math-display)/.test(name))) {
              const raw = source.slice(range.from, range.to);
              if (/^ {0,3}(`{3,}|~{3,})/.test(raw)) range.from += raw.indexOf('\n') + 1;
              else if (raw.startsWith('`')) range.from += /^`+/.exec(raw)![0].length;
              map(child, child.children.map(node => node.type === 'text' ? node.value : '').join(''), range, true);
            }
            return child;
          }
          walk(child);
        } else if (child.type === 'text') {
          const range = bounds(child);
          if (range) {
            const span: Element = { type: 'element', tagName: 'span', properties: {}, children: [child] };
            map(span, child.value, range);
            return span;
          }
        }
        return child;
      });
    };
    walk(tree);
  };
}
