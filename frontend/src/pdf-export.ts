import { invoke, isTauri } from '@tauri-apps/api/core';
import 'katex/dist/katex.min.css';
import './pdf-export.css';

void (async () => {
  if (!isTauri()) return;
  const payload = await invoke<{ html: string; title: string }>('export_payload');
  document.title = payload.title;
  document.getElementById('document')!.innerHTML = payload.html;
  // Hidden WebViews can postpone font discovery until their first paint. Load
  // the bundled faces explicitly so the saved equations cannot have blank glyphs.
  await Promise.all(Array.from(document.fonts).map(font => font.load()));
  await document.fonts.ready;
  await Promise.all(Array.from(document.images).map(img => img.decode().catch(() => {})));
  document.getElementById('document')!.getBoundingClientRect();
  await invoke('export_ready');
})().catch(error => { void invoke('export_failed', { message: String(error) }); });
