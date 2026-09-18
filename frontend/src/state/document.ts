export type SaveStatus = 'saved' | 'modified' | 'saving' | 'conflict' | 'error';
type Change = 'edit' | 'reload' | 'status';
type Writer = (text: string, version: string) => Promise<string>;

/** One save queue per document. Typing never waits for I/O. */
export class DocumentSession {
  text: string;
  savedText: string;
  version: string;
  status: SaveStatus = 'saved';
  error = '';
  private listeners = new Set<(kind: Change) => void>();
  private flight: Promise<void> | undefined;
  private disposed = false;
  constructor(public path: string, contents: string, version: string, private writer: Writer) {
    this.text = contents; this.savedText = contents; this.version = version;
  }
  get dirty() { return this.text !== this.savedText; }
  subscribe(fn: (kind: Change) => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit(kind: Change) { this.listeners.forEach(fn => fn(kind)); }
  private setStatus(status: SaveStatus) { if (status !== this.status) { this.status = status; this.emit('status'); } }
  edit(text: string) {
    this.text = text;
    this.emit('edit');
    if (this.status === 'conflict') return;
    this.setStatus(this.flight ? 'saving' : this.dirty ? 'modified' : 'saved');
  }
  async flush(): Promise<void> {
    // Save only the snapshot explicitly requested by the user. Later typing stays dirty.
    const snapshot = this.text;
    const previous = this.flight;
    const write = async () => {
      if (previous) await previous;
      if (this.disposed) return;
      if (this.status === 'conflict') throw new Error(this.error || 'Resolve the file conflict before saving.');
      if (snapshot === this.savedText) return;
      this.setStatus('saving');
      try {
        this.version = await this.writer(snapshot, this.version);
        this.savedText = snapshot;
        this.error = '';
        this.setStatus(this.dirty ? 'modified' : 'saved');
      } catch (error) {
        this.error = String(error).replace(/^Error: /, '');
        this.setStatus(this.error.includes('CONFLICT:') ? 'conflict' : 'error');
        throw error;
      }
    };
    const flight = write();
    this.flight = flight;
    try { await flight; } finally { if (this.flight === flight) this.flight = undefined; }
  }
  async settled() { await this.flight; }
  async external(contents: string, version: string) {
    // Watch events caused by our own atomic rename arrive before the IPC response.
    if (this.flight) await this.flight.catch(() => {});
    if (version === this.version) return;
    if (this.dirty) { this.error = 'CONFLICT: This document changed on disk. Your edits are still here.'; this.setStatus('conflict'); }
    else this.reload(contents, version);
  }
  reload(contents: string, version: string) {
    this.text = contents; this.savedText = contents; this.version = version; this.error = '';
    this.setStatus('saved'); this.emit('reload');
  }
  missing() { this.error = 'CONFLICT: This document was moved or deleted outside Feather. Save a copy to keep your text.'; this.setStatus('conflict'); }
  dispose() { this.disposed = true; this.listeners.clear(); }
}
