import { useEffect, useRef, useState } from 'preact/hooks';
import { AnnotationMode, GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { EventBus, PDFViewer } from 'pdfjs-dist/legacy/web/pdf_viewer.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import 'pdfjs-dist/legacy/web/pdf_viewer.css';

GlobalWorkerOptions.workerSrc = workerUrl;

/** Only loaded for TeX documents. PDF.js renders visible pages and keeps text selectable. */
export default function PdfViewer({ data }: { data: string }) {
  const container = useRef<HTMLDivElement>(null), pages = useRef<HTMLDivElement>(null);
  const viewer = useRef<PDFViewer>();
  const [error, setError] = useState('');
  const [position, setPosition] = useState({ page: 1, total: 0 });
  useEffect(() => {
    const abort = new AbortController();
    const eventBus = new EventBus();
    const options = {
      container: container.current!, viewer: pages.current!, eventBus,
      annotationMode: AnnotationMode.DISABLE, enableAutoLinking: false,
      maxCanvasPixels: 8_000_000, abortSignal: abort.signal,
    };
    const pdfViewer = new PDFViewer(options);
    viewer.current = pdfViewer;
    eventBus.on('pagesinit', () => { pdfViewer.currentScaleValue = 'page-width'; });
    eventBus.on('pagechanging', ({ pageNumber }: { pageNumber: number }) => setPosition(p => ({ ...p, page: pageNumber })));
    eventBus.on('pagerendered', ({ error }: { error?: Error }) => { if (error) setError(`PDF preview: ${error.message}`); });
    const resize = new ResizeObserver(() => { if (pdfViewer.pdfDocument) pdfViewer.currentScaleValue = 'page-width'; });
    resize.observe(container.current!);
    return () => { resize.disconnect(); pdfViewer.setDocument(null!); abort.abort(); viewer.current = undefined; };
  }, []);
  useEffect(() => {
    let disposed = false;
    setError('');
    const loading = getDocument({
      data: Uint8Array.from(atob(data), c => c.charCodeAt(0)),
      useSystemFonts: true, useWasm: false,
    });
    void loading.promise.then(pdf => {
      if (disposed) return;
      setPosition(p => ({ page: Math.min(p.page, pdf.numPages), total: pdf.numPages }));
      viewer.current?.setDocument(pdf);
    }).catch(error => { if (!disposed) setError(`PDF preview: ${String(error)}`); });
    return () => { disposed = true; viewer.current?.setDocument(null!); void loading.destroy(); };
  }, [data]);
  return <div class="pdf-preview">
    <div class="pdf-navigation">
      <button aria-label="Previous PDF page" disabled={position.page <= 1} onClick={() => { if (viewer.current) viewer.current.currentPageNumber--; }}>‹</button>
      <span aria-live="polite">{position.total ? `Page ${position.page} of ${position.total}` : 'Loading PDF…'}</span>
      <button aria-label="Next PDF page" disabled={position.page >= position.total} onClick={() => { if (viewer.current) viewer.current.currentPageNumber++; }}>›</button>
    </div>
    {error && <div class="preview-notice" role="alert">{error}</div>}
    <div class="pdf-viewport"><div class="pdf-scroll" ref={container}><div class="pdfViewer" ref={pages} /></div></div>
  </div>;
}
