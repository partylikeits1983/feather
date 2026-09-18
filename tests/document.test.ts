import { describe, it, expect, vi, afterEach } from 'vitest';
import { DocumentSession } from '../frontend/src/state/document';

afterEach(() => vi.useRealTimers());
describe('save queue', () => {
  it('never saves on a timer and explicitly saves the newest text', async () => {
    vi.useFakeTimers(); const writer = vi.fn(async () => 'v2');
    const doc = new DocumentSession('a.md', 'old', 'v1', writer);
    doc.edit('one'); await vi.advanceTimersByTimeAsync(400); doc.edit('two');
    await vi.advanceTimersByTimeAsync(499); expect(writer).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000); expect(writer).not.toHaveBeenCalled();
    await doc.flush(); expect(writer).toHaveBeenCalledWith('two', 'v1'); expect(doc.dirty).toBe(false);
    doc.dispose();
  });
  it('leaves edits made during a save unsaved until the next explicit save', async () => {
    let finish!: (version: string) => void;
    const writer = vi.fn().mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve; })).mockResolvedValueOnce('v3');
    const doc = new DocumentSession('a.md', 'old', 'v1', writer);
    doc.edit('first'); const save = doc.flush(); doc.edit('second'); finish('v2'); await save;
    expect(writer).toHaveBeenCalledTimes(1); expect(doc.savedText).toBe('first'); expect(doc.text).toBe('second'); expect(doc.status).toBe('modified');
    await doc.flush();
    expect(writer).toHaveBeenNthCalledWith(2, 'second', 'v2'); expect(doc.savedText).toBe('second'); expect(doc.version).toBe('v3');
    doc.dispose();
  });
  it('serializes repeated explicit saves and keeps newer typing dirty', async () => {
    let finish!: (version: string) => void;
    const writer = vi.fn().mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve; })).mockResolvedValueOnce('v3');
    const doc = new DocumentSession('a.md', 'old', 'v1', writer);
    doc.edit('first'); const first = doc.flush(); doc.edit('second'); const second = doc.flush(); doc.edit('third');
    finish('v2'); await Promise.all([first, second]);
    expect(writer).toHaveBeenNthCalledWith(2, 'second', 'v2'); expect(doc.savedText).toBe('second'); expect(doc.text).toBe('third'); expect(doc.dirty).toBe(true);
  });
  it('preserves dirty text on conflict and blocks switching', async () => {
    const doc = new DocumentSession('a.md', 'old', 'v1', async () => { throw new Error('CONFLICT: outside change'); });
    doc.edit('mine'); await expect(doc.flush()).rejects.toThrow('CONFLICT');
    expect(doc.text).toBe('mine'); expect(doc.status).toBe('conflict');
    doc.edit('more of mine'); await expect(doc.flush()).rejects.toThrow('CONFLICT');
    doc.dispose();
  });
  it('reloads only clean documents after an external edit', async () => {
    const doc = new DocumentSession('a.md', 'old', 'v1', async () => 'v3');
    await doc.external('outside', 'v2'); expect(doc.text).toBe('outside');
    doc.edit('mine'); await doc.external('second outside', 'v3'); expect(doc.text).toBe('mine'); expect(doc.status).toBe('conflict');
    doc.dispose();
  });
  it('reports a failed save and supports retry', async () => {
    const writer = vi.fn().mockRejectedValueOnce(new Error('Disk full')).mockResolvedValueOnce('v2');
    const doc = new DocumentSession('a.md', 'old', 'v1', writer); doc.edit('mine');
    await expect(doc.flush()).rejects.toThrow('Disk full'); expect(doc.dirty).toBe(true);
    await doc.flush(); expect(doc.dirty).toBe(false); doc.dispose();
  });
});
