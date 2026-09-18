import { Annotation, Compartment, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import type { PreviewHandle } from './Preview';

const configurations = new WeakMap<EditorView, Compartment>();
const fromPreview = Annotation.define<boolean>();
const setPreviewRange = StateEffect.define<{ from: number; to: number }>();
const previewMarks = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, transaction) {
    if (transaction.docChanged || (transaction.selection && !transaction.annotation(fromPreview))) marks = Decoration.none;
    for (const effect of transaction.effects) if (effect.is(setPreviewRange)) {
      const { from, to } = effect.value;
      marks = from === to ? Decoration.none : Decoration.set([Decoration.mark({ class: 'cm-preview-selection' }).range(from, to)]);
    }
    return marks;
  },
  provide: field => EditorView.decorations.from(field),
});
type Mapped = { element: HTMLElement; from: number; to: number; offsets?: number[] };

/** Mirror selections without moving browser focus or replacing the preview DOM. */
export function synchronizeSelection(view: EditorView, preview: PreviewHandle) {
  const { article, element: scroll } = preview;
  const mapped: Mapped[] = Array.from(article.querySelectorAll<HTMLElement>('[data-source-text]')).map(element => ({
    element, from: Number(element.dataset.sourceStart), to: Number(element.dataset.sourceEnd),
    offsets: element.dataset.sourceMap ? JSON.parse(element.dataset.sourceMap) : undefined,
  }));
  const blocks = Array.from(article.querySelectorAll<HTMLElement>('[data-source-start]'));
  const overlay = document.createElement('div'); overlay.className = 'preview-selection-layer'; overlay.setAttribute('aria-hidden', 'true'); scroll.append(overlay);
  let compartment = configurations.get(view);
  if (!compartment) { compartment = new Compartment(); configurations.set(view, compartment); view.dispatch({ effects: StateEffect.appendConfig.of(compartment.of([])) }); }
  const configuration = compartment;
  let frame = 0, disposed = false;
  const sourceOffset = (entry: Mapped, offset: number) => entry.offsets?.[offset] ?? Math.min(entry.to, entry.from + offset);
  const textOffset = (entry: Mapped, source: number) => {
    if (!entry.offsets) return Math.max(0, Math.min(entry.element.textContent?.length || 0, source - entry.from));
    const index = entry.offsets.findIndex(offset => offset >= source);
    return index < 0 ? entry.offsets.length - 1 : index;
  };
  function point(element: HTMLElement, offset: number): [Node, number] {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node: Node | null, last: Node = element;
    while ((node = walker.nextNode())) { last = node; if (offset <= node.textContent!.length) return [node, offset]; offset -= node.textContent!.length; }
    return [last, last.nodeType === Node.TEXT_NODE ? last.textContent!.length : 0];
  }
  function range(entry: Mapped, from: number, to: number) {
    const range = document.createRange();
    range.setStart(...point(entry.element, textOffset(entry, from))); range.setEnd(...point(entry.element, textOffset(entry, to)));
    return range;
  }
  function rectangle(rect: DOMRect, caret: boolean) {
    if (!rect.height) return;
    const parent = scroll.getBoundingClientRect(), marker = document.createElement('span');
    marker.className = caret ? 'preview-caret' : 'preview-selection';
    // Rectangles are viewport pixels; compensate for the app's CSS zoom.
    const scale = parent.width / scroll.offsetWidth || 1;
    Object.assign(marker.style, { left: `${(rect.left - parent.left) / scale + scroll.scrollLeft}px`, top: `${(rect.top - parent.top) / scale + scroll.scrollTop}px`, width: caret ? '2px' : `${rect.width / scale}px`, height: `${rect.height / scale}px` });
    overlay.append(marker);
  }
  function draw() {
    frame = 0; overlay.replaceChildren();
    if (disposed || preview.source !== view.state.doc.sliceString(0, 180_001)) return;
    const { from, to, head, empty } = view.state.selection.main;
    const atoms = Array.from(article.querySelectorAll<HTMLElement>('[data-source-atomic]'));
    if (!empty) {
      for (const atom of atoms) if (Number(atom.dataset.sourceEnd) > from && Number(atom.dataset.sourceStart) < to) rectangle(atom.getBoundingClientRect(), false);
      for (const entry of mapped) if (entry.to > from && entry.from < to) {
        for (const rect of range(entry, Math.max(entry.from, from), Math.min(entry.to, to)).getClientRects()) rectangle(rect, false);
      }
    } else {
      const atom = atoms.find(atom => Number(atom.dataset.sourceStart) <= head && Number(atom.dataset.sourceEnd) >= head);
      if (atom) { rectangle(atom.getBoundingClientRect(), true); return; }
      let entry = mapped.find(entry => entry.from <= head && entry.to >= head);
      const block = blocks.filter(element => Number(element.dataset.sourceStart) <= head && Number(element.dataset.sourceEnd) >= head).pop();
      if (!entry && block) entry = mapped.find(entry => block.contains(entry.element));
      if (entry) {
        const rect = range(entry, head, head).getBoundingClientRect();
        if (rect.height) rectangle(rect, true);
        else rectangle(entry.element.getBoundingClientRect(), true);
      } else if (block) rectangle(block.getBoundingClientRect(), true);
      else {
        // Blank lines and Markdown punctuation map to the nearest rendered text boundary.
        entry = mapped.reduce<Mapped | undefined>((best, entry) => !best || Math.min(Math.abs(entry.from - head), Math.abs(entry.to - head)) < Math.min(Math.abs(best.from - head), Math.abs(best.to - head)) ? entry : best, undefined);
        if (entry) rectangle(range(entry, head, head).getBoundingClientRect(), true);
      }
    }
  }
  const schedule = () => { if (!disposed && !frame) frame = requestAnimationFrame(draw); };
  function endpoint(node: Node, offset: number, end: boolean): number | null {
    const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
    const mappedElement = element?.closest<HTMLElement>('[data-source-text]');
    const entry = mapped.find(entry => entry.element === mappedElement);
    if (entry) {
      const before = document.createRange(); before.selectNodeContents(entry.element); before.setEnd(node, offset);
      return sourceOffset(entry, before.toString().length);
    }
    const block = element?.closest<HTMLElement>('[data-source-start]');
    if (block && article.contains(block)) return Number(end ? block.dataset.sourceEnd : block.dataset.sourceStart);
    return null;
  }
  function selectionChanged() {
    const selection = document.getSelection();
    if (!selection?.rangeCount || !selection.anchorNode || !selection.focusNode || !article.contains(selection.anchorNode) || !article.contains(selection.focusNode)) return;
    if (preview.source !== view.state.doc.sliceString(0, 180_001)) return;
    const selected = selection.getRangeAt(0);
    const from = endpoint(selected.startContainer, selected.startOffset, false), to = endpoint(selected.endContainer, selected.endOffset, true);
    if (from === null || to === null || to < from) return;
    if (view.state.selection.main.from === from && view.state.selection.main.to === to) return;
    const { anchorNode, anchorOffset, focusNode, focusOffset } = selection;
    const reverse = selection.anchorNode === selected.endContainer && selection.anchorOffset === selected.endOffset;
    if (view.hasFocus) view.contentDOM.blur();
    view.dispatch({ selection: { anchor: reverse ? to : from, head: reverse ? from : to }, annotations: fromPreview.of(true), effects: setPreviewRange.of({ from, to }) });
    // WebKit may clear a DOM range when the previously focused editor blurs.
    if (selection.anchorNode !== anchorNode || selection.anchorOffset !== anchorOffset || selection.focusNode !== focusNode || selection.focusOffset !== focusOffset) {
      selection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);
    }
    schedule();
  }
  view.dispatch({ effects: configuration.reconfigure([
    previewMarks, EditorView.updateListener.of(update => { if (update.docChanged || update.selectionSet) schedule(); }),
  ]) });
  document.addEventListener('selectionchange', selectionChanged);
  const observer = new ResizeObserver(schedule); observer.observe(article); observer.observe(scroll);
  schedule();
  return () => {
    disposed = true; cancelAnimationFrame(frame); observer.disconnect(); document.removeEventListener('selectionchange', selectionChanged); overlay.remove();
    view.dispatch({ effects: configuration.reconfigure([]) });
  };
}
