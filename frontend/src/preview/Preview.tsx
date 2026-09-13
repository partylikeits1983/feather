import { useEffect, useRef, useState } from 'preact/hooks';
import type { DocumentSession } from '../state/document';
import { api } from '../api';
import { resolveRelative } from '../types';
import { Icon } from '../components/Icon';
import { lazy, Suspense } from 'preact/compat';

const PdfViewer = lazy(() => import('./PdfViewer'));

export interface PreviewHandle { scrollToLine: (line: number) => void }
export function Preview({ session, workspaceId, onLink, onSource, onScroll, onHandle, imageRevision }: {
  session: DocumentSession; workspaceId?: number; onLink: (href: string) => void; onSource: (line: number) => void;
  onScroll: (line: number) => void; onHandle: (handle: PreviewHandle | null) => void; imageRevision: number;
}) {
  const scroll = useRef<HTMLDivElement>(null), article = useRef<HTMLElement>(null);
  const [result, setResult] = useState({ html: '', truncated: false });
  const [error, setError] = useState('');
  const blocks = useRef<HTMLElement[]>([]);
  useEffect(() => {
    const worker = new Worker(new URL('./markdown.worker.ts', import.meta.url), { type: 'module' });
    let revision = 0, busy = false, pending = false, timer: ReturnType<typeof setTimeout>;
    const send = () => {
      if (busy) { pending = true; return; }
      busy = true; pending = false;
      worker.postMessage({ id: revision, source: session.text.slice(0, 180_001) });
    };
    const schedule = () => { revision++; clearTimeout(timer); timer = setTimeout(send, 40); };
    worker.onmessage = event => {
      busy = false;
      if (event.data.id === revision) {
        if (event.data.error) setError(event.data.error);
        else { setError(''); setResult(event.data); }
      }
      if (pending) send();
    };
    worker.onerror = () => { busy = false; setError('The preview could not render. Your source is safe; reopen the document to retry.'); };
    const off = session.subscribe(kind => { if (kind !== 'status') schedule(); });
    send();
    return () => { off(); clearTimeout(timer); worker.terminate(); };
  }, [session]);

  useEffect(() => {
    blocks.current = Array.from(article.current?.querySelectorAll<HTMLElement>('[data-source-line]') || []);
    onHandle({ scrollToLine(line) {
      let closest = blocks.current[0];
      for (const block of blocks.current) { if (Number(block.dataset.sourceLine) <= line) closest = block; else break; }
      if (closest && scroll.current) scroll.current.scrollTop += closest.getBoundingClientRect().top - scroll.current.getBoundingClientRect().top - 32;
    } });
    let cancelled = false;
    if (workspaceId) for (const img of article.current?.querySelectorAll<HTMLImageElement>('img[data-local-image]') || []) {
      try {
        const path = resolveRelative(session.path, img.dataset.localImage!);
        void api.image(workspaceId, path).then(src => { if (!cancelled) img.src = src; }).catch(error => { img.alt = `${img.alt || 'Image'} (${String(error)})`; });
      } catch { img.alt = `${img.alt || 'Image'} (outside the opened folder)`; }
    }
    return () => { cancelled = true; onHandle(null); };
  }, [result.html, workspaceId, imageRevision]);

  return <div class="preview-scroll" ref={scroll} onScroll={() => {
    const top = scroll.current!.getBoundingClientRect().top + 40;
    let closest = blocks.current[0];
    for (const block of blocks.current) { if (block.getBoundingClientRect().top <= top) closest = block; else break; }
    if (closest) onScroll(Number(closest.dataset.sourceLine));
  }}>
    {error && <div class="preview-notice">{error}</div>}
    <article class="markdown-body" ref={article} onClick={event => {
      const anchor = (event.target as Element).closest('a');
      if (anchor) { event.preventDefault(); const href = anchor.getAttribute('href'); if (!href) return;
        if (href.startsWith('#')) { try { article.current?.querySelector(`#${CSS.escape(decodeURIComponent(href.slice(1)))}`)?.scrollIntoView({ block: 'start' }); } catch { /* malformed anchor */ } }
        else onLink(href);
      }
    }} onDblClick={event => {
      if ((event.target as Element).closest('a')) return;
      const block = (event.target as Element).closest<HTMLElement>('[data-source-line]');
      if (block) onSource(Number(block.dataset.sourceLine));
    }} dangerouslySetInnerHTML={{ __html: result.html }} />
    {result.truncated && <div class="preview-notice"><Icon name="eye" /> Showing the beginning of this large document to keep editing responsive. The full source is editable and saved.</div>}
  </div>;
}

export function TexPreview({ session, workspaceId }: { session: DocumentSession; workspaceId: number }) {
  const [pdf, setPdf] = useState(''), [log, setLog] = useState(''), [busy, setBusy] = useState(false), [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    let disposed = false, revision = 0, running = false, pending = false;
    let timer: ReturnType<typeof setTimeout>;
    const compile = async () => {
      if (running) { pending = true; return; }
      running = true; pending = false; const ticket = revision; setBusy(true);
      try {
        const result = await api.compile(workspaceId, session.path, session.text);
        if (disposed || ticket !== revision) return;
        setLog(result.log);
        setFailed(!result.pdf);
        if (result.pdf) setPdf(result.pdf);
      } catch (error) { if (!disposed && ticket === revision) { setLog(String(error)); setFailed(true); } }
      finally { running = false; if (!disposed) { setBusy(false); if (pending) void compile(); } }
    };
    const off = session.subscribe(kind => {
      if (kind !== 'status') { revision++; clearTimeout(timer); timer = setTimeout(() => void compile(), 300); }
    });
    void compile();
    return () => { disposed = true; off(); clearTimeout(timer); };
  }, [session, workspaceId, retry]);
  return <div class="tex-preview">
    {pdf ? <Suspense fallback={<div class="pdf-empty">Loading PDF…</div>}><PdfViewer data={pdf} /></Suspense> : <div class="pdf-empty"><Icon name="file" size={38} /><h2>{failed ? 'Could not compile this document' : 'Preparing your PDF'}</h2><p>{busy ? 'Compiling your document…' : 'Check the LaTeX output below, then compile again.'}</p></div>}
    <details class="compile-log" open={!pdf || failed}><summary>{busy ? 'Compiling…' : failed ? (pdf ? 'Compile failed · showing the last successful PDF' : 'LaTeX compilation failed') : 'LaTeX output'}<button onClick={event => { event.preventDefault(); setRetry(n => n + 1); }} disabled={busy}>Compile again</button></summary><pre>{log || 'Tectonic runs offline. The first compile may take a moment.'}</pre></details>
  </div>;
}
