import { describe, expect, it } from 'vitest';
import { Notebook } from '../frontend/src/state/notebook';

function storage() {
  const data = new Map<string, string>();
  return { data, fail: false, getItem: (key: string) => data.get(key) ?? null,
    setItem(key: string, value: string) { if (this.fail) throw new Error('Storage full'); data.set(key, value); } };
}

describe('personal notebook', () => {
  it('preserves existing scratchpad text, including an intentionally empty document', async () => {
    const saved = storage(); saved.setItem('feather.scratchpad', 'My original thoughts');
    const notebook = new Notebook(saved);
    expect(notebook.scratchpad.text).toBe('My original thoughts');
    notebook.scratchpad.edit(''); await notebook.scratchpad.flush();
    expect(new Notebook(saved).scratchpad.text).toBe('');
  });

  it('keeps named notes across launches and saves only explicitly saved text', async () => {
    const saved = storage(), notebook = new Notebook(saved);
    const first = notebook.create('Ideas'), second = notebook.create('Reading.md');
    first.edit('# My ideas'); second.edit('Still a draft');
    await first.flush();
    const reopened = new Notebook(saved);
    expect(reopened.find('Ideas.md')?.text).toBe('# My ideas');
    expect(reopened.find('Reading.md')?.text).toBe('');
    expect(saved.getItem('feather.scratchpad')).toBeNull();
  });

  it('renames without saving pending edits and saves later edits under the new name', async () => {
    const saved = storage(), notebook = new Notebook(saved), note = notebook.create('Ideas');
    note.edit('Saved text'); await note.flush(); note.edit('Pending edits');
    notebook.rename(note, 'Journal');
    expect(note.dirty).toBe(true);
    expect(new Notebook(saved).find('Journal.md')?.text).toBe('Saved text');
    await note.flush();
    expect(new Notebook(saved).find('Journal.md')?.text).toBe('Pending edits');
    notebook.remove(note);
    expect(new Notebook(saved).notes).toEqual([]);
  });

  it('rejects duplicate names, path traversal and changes to the original scratchpad', () => {
    const notebook = new Notebook(storage()); notebook.create('Ideas');
    for (const name of ['ideas.md', 'Scratchpad', '../Outside', 'folder/note', '', '..']) expect(() => notebook.create(name)).toThrow();
    expect(() => notebook.rename(notebook.scratchpad, 'Gone')).toThrow();
    expect(() => notebook.remove(notebook.scratchpad)).toThrow();
  });

  it('preserves documents and unsaved edits when storage fails', async () => {
    const saved = storage(), notebook = new Notebook(saved), note = notebook.create('Ideas');
    note.edit('Keep this'); saved.fail = true;
    await expect(note.flush()).rejects.toThrow('Storage full');
    expect(note.dirty).toBe(true);
    expect(() => notebook.rename(note, 'Renamed')).toThrow();
    expect(() => notebook.remove(note)).toThrow();
    expect(() => notebook.create('Second')).toThrow();
    expect(notebook.notes).toEqual([note]); expect(note.path).toBe('Ideas.md');
    saved.fail = false; await note.flush();
    expect(new Notebook(saved).find('Ideas.md')?.text).toBe('Keep this');
  });

  it('does not overwrite unreadable stored notes', () => {
    const saved = storage(); saved.setItem('feather.notes', '{broken');
    const notebook = new Notebook(saved);
    expect(notebook.error).toContain('left intact');
    expect(() => notebook.create('New')).toThrow();
    expect(saved.getItem('feather.notes')).toBe('{broken');
  });
});
