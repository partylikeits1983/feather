import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';
import { basename } from '../types';

export function ImageViewer({ workspaceId, path, revision }: { workspaceId: number; path: string; revision: number }) {
  const [src, setSrc] = useState(''), [error, setError] = useState('');
  const [size, setSize] = useState(''), [actual, setActual] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setError('');
    void api.image(workspaceId, path).then(value => { if (!cancelled) setSrc(value); }).catch(error => {
      if (!cancelled) { setSrc(''); setError(String(error)); }
    });
    return () => { cancelled = true; };
  }, [workspaceId, path, revision]);
  return <section class="image-viewer" aria-label="Image viewer">
    <div class="image-toolbar"><span>{size}</span><button aria-pressed={!actual} onClick={() => setActual(false)}>Fit image</button><button aria-pressed={actual} onClick={() => setActual(true)}>Actual size</button></div>
    {error ? <p role="alert" class="preview-notice">Could not open image: {error}</p> : src ? <div class={`image-scroll ${actual ? 'actual-size' : ''}`}><img src={src} alt={basename(path)} onLoad={event => { setSize(`${event.currentTarget.naturalWidth} × ${event.currentTarget.naturalHeight}`); }} onError={() => setError('The file could not be decoded as an image.')} /></div> : <p class="preview-notice">Loading image…</p>}
  </section>;
}
