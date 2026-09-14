import { describe, expect, it } from 'vitest';
import { mappedScroll, type ScrollAnchor } from '../frontend/src/preview/scroll-sync';

describe('continuous scroll mapping', () => {
  const anchors: ScrollAnchor[] = [[0, 0], [100, 200], [300, 800], [1000, 1500]];
  it('moves within blocks instead of snapping to their starts', () => {
    expect(mappedScroll(anchors, 125, 0)).toBe(275);
    expect(mappedScroll(anchors, 125.5, 0)).toBe(276.5);
    expect(mappedScroll(anchors, 276.5, 1)).toBe(125.5);
    expect(mappedScroll(anchors, 99.99, 0)).toBeCloseTo(199.98);
    expect(mappedScroll(anchors, 100.01, 0)).toBeCloseTo(200.03);
  });
  it('aligns the ends and clamps overscroll', () => {
    expect(mappedScroll(anchors, -10, 0)).toBe(0);
    expect(mappedScroll(anchors, 1000, 0)).toBe(1500);
    expect(mappedScroll(anchors, 2000, 1)).toBe(1000);
    expect(mappedScroll([[0, 0], [0, 500]], 0, 0)).toBe(0);
    expect(mappedScroll([[0, 0], [500, 0]], 100, 1)).toBe(500);
  });
});
