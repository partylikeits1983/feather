import { api } from '../api';
import { basename, resolveRelative } from '../types';

export async function exportMarkdown(source: string, path: string, workspaceId?: number) {
  const html = await new Promise<string>((resolve, reject) => {
    const worker = new Worker(new URL('./markdown.worker.ts', import.meta.url), { type: 'module' });
    const finish = () => { clearTimeout(timer); worker.terminate(); };
    const timer = setTimeout(() => { finish(); reject(new Error('PDF preparation took too long. Try exporting a smaller document.')); }, 30_000);
    worker.onmessage = event => { finish(); event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.html); };
    worker.onerror = () => { finish(); reject(new Error('Could not prepare this document for PDF export')); };
    worker.postMessage({ id: 1, source, full: true });
  });
  const fragment = new DOMParser().parseFromString(html, 'text/html');
  fragment.querySelectorAll('img').forEach(img => { img.loading = 'eager'; });
  if (workspaceId) await Promise.all(Array.from(fragment.querySelectorAll<HTMLImageElement>('img[data-local-image]')).map(async img => {
    try { img.src = await api.image(workspaceId, resolveRelative(path, img.dataset.localImage!)); }
    catch { img.alt = `${img.alt || 'Image'} (image unavailable)`; }
  }));
  return api.exportMarkdown(fragment.body.innerHTML, basename(path).replace(/\.[^.]+$/, ''));
}
