import type { EditorView } from '@codemirror/view';
import type { PreviewHandle } from './Preview';

export type ScrollAnchor = readonly [source: number, preview: number];

// The same piecewise linear map in both directions, including document ends.
export function mappedScroll(anchors: readonly ScrollAnchor[], position: number, side: 0 | 1) {
  const other = side === 0 ? 1 : 0;
  if (position <= anchors[0][side]) return anchors[0][other];
  for (let index = 1; index < anchors.length; index++) {
    const next = anchors[index], previous = anchors[index - 1];
    if (position <= next[side]) {
      const distance = next[side] - previous[side];
      return previous[other] + (distance ? (position - previous[side]) / distance : 0) * (next[other] - previous[other]);
    }
  }
  return anchors[anchors.length - 1][other];
}

export function synchronizeScroll(view: EditorView, preview: PreviewHandle) {
  const elements = [view.scrollDOM, preview.element] as const;
  const last = elements.map(element => element.scrollTop);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let anchors: ScrollAnchor[] = [], dirty = true, leader: 0 | 1 = 0, frame = 0, previousTime = 0;

  function measure() {
    if (!dirty) return;
    dirty = false;
    const [source, rendered] = elements;
    const sourceMax = Math.max(0, source.scrollHeight - source.clientHeight);
    const previewMax = Math.max(0, rendered.scrollHeight - rendered.clientHeight);
    const sourceTop = view.documentTop - source.getBoundingClientRect().top + source.scrollTop;
    const previewTop = rendered.getBoundingClientRect().top;
    anchors = [[0, 0]];
    for (const block of preview.blocks()) {
      const line = Number(block.dataset.sourceLine);
      if (!Number.isInteger(line) || line < 1 || line > view.state.doc.lines) continue;
      const x = sourceTop + view.lineBlockAt(view.state.doc.line(line).from).top - 28;
      const y = block.getBoundingClientRect().top - previewTop + rendered.scrollTop - 32;
      const previous = anchors[anchors.length - 1];
      // Nested Markdown nodes can share lines or positions. Keep the map invertible.
      if (x > previous[0] && y > previous[1] && x < sourceMax && y < previewMax) anchors.push([x, y]);
    }
    anchors.push([sourceMax, previewMax]);
  }

  function tick(time: number) {
    frame = 0;
    measure();
    const follower = leader === 0 ? 1 : 0, element = elements[follower];
    const target = mappedScroll(anchors, elements[leader].scrollTop, leader);
    const delta = target - element.scrollTop;
    const elapsed = previousTime ? Math.min(64, time - previousTime) : 16;
    previousTime = time;
    let settled = Math.abs(delta) < .5 || reducedMotion.matches;
    const before = element.scrollTop;
    const next = settled ? target : element.scrollTop + delta * (1 - Math.exp(-elapsed / 35));
    element.scrollTop = next;
    // WebKit can round small easing steps to zero. Finish the last pixel(s)
    // instead of stalling forever just short of the destination.
    if (!settled && element.scrollTop === before) { element.scrollTop = target; settled = true; }
    // Read the actual value because browsers may clamp or round scrollTop.
    last[follower] = element.scrollTop;
    if (!settled) frame = requestAnimationFrame(tick);
  }

  const cleanups = elements.map((element, index) => {
    const side = index as 0 | 1;
    const takeControl = () => {
      leader = side;
      cancelAnimationFrame(frame); frame = 0; previousTime = 0;
    };
    const onScroll = () => {
      const top = element.scrollTop;
      if (Math.abs(top - last[side]) < .01) return;
      last[side] = top;
      // CodeMirror adjusts its scroll position while measuring virtualized lines.
      // Only actual input transfers control; follower layout events cannot do so.
      if (side !== leader) return;
      if (!frame) { previousTime = 0; frame = requestAnimationFrame(tick); }
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) element.addEventListener(event, takeControl, { passive: true });
    return () => {
      element.removeEventListener('scroll', onScroll);
      for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) element.removeEventListener(event, takeControl);
    };
  });
  const observer = new ResizeObserver(() => { dirty = true; });
  for (const element of [...elements, view.contentDOM, preview.element.querySelector('.markdown-body')]) if (element) observer.observe(element);
  return () => { cancelAnimationFrame(frame); observer.disconnect(); cleanups.forEach(cleanup => cleanup()); };
}
