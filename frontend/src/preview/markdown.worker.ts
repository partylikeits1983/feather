import { renderMarkdown } from './markdown';
self.onmessage = async (event: MessageEvent<{ id: number; source: string; full?: boolean }>) => {
  try { self.postMessage({ id: event.data.id, ...await renderMarkdown(event.data.source, event.data.full ? Infinity : undefined) }); }
  catch (error) { self.postMessage({ id: event.data.id, error: String(error) }); }
};
