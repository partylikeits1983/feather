import { DocumentSession } from './document';
import { welcome } from '../welcome';

const notesKey = 'feather.notes';
type SavedNote = { name: string; contents: string };
type NoteStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Personal notes share the scratchpad's local storage, independent of workspaces. */
export class Notebook {
  readonly scratchpad: DocumentSession;
  notes: DocumentSession[] = [];
  error = '';

  constructor(private storage: NoteStorage) {
    let contents = welcome;
    try { contents = storage.getItem('feather.scratchpad') ?? welcome; }
    catch { this.error = 'Could not read your local scratchpad.'; }
    this.scratchpad = new DocumentSession('Scratchpad.md', contents, 'scratch', async text => {
      storage.setItem('feather.scratchpad', text); return 'scratch';
    });
    try {
      const saved: unknown = JSON.parse(storage.getItem(notesKey) ?? '[]');
      if (!Array.isArray(saved)) throw new Error('Invalid notes');
      const names = new Set(['scratchpad.md']);
      for (const note of saved) {
        if (!note || typeof note.name !== 'string' || typeof note.contents !== 'string' ||
          !/\.md$/i.test(note.name) || /[/\\\x00-\x1f]/.test(note.name) || names.has(note.name.toLowerCase())) throw new Error('Invalid note');
        names.add(note.name.toLowerCase());
      }
      this.notes = saved.map(note => this.session(note.name, note.contents));
    } catch { this.error = 'Could not read your saved notes. Your stored data has been left intact.'; }
  }

  get documents() { return [this.scratchpad, ...this.notes]; }
  owns(session: DocumentSession) { return this.documents.includes(session); }
  find(name: string) { return this.documents.find(note => note.path === name); }

  private session(name: string, contents: string) {
    const session = new DocumentSession(name, contents, 'note', async text => {
      this.write(this.notes.map(note => ({ name: note.path, contents: note === session ? text : note.savedText })));
      return 'note';
    });
    return session;
  }

  private write(notes: SavedNote[]) {
    if (this.error) throw new Error(this.error);
    this.storage.setItem(notesKey, JSON.stringify(notes));
  }

  private filename(value: string, except?: DocumentSession) {
    let name = value.trim();
    if (!name || name === '.' || name === '..' || /[/\\\x00-\x1f]/.test(name)) throw new Error('Use a name without slashes or control characters.');
    if (!/\.md$/i.test(name)) name += '.md';
    if (this.documents.some(note => note !== except && note.path.toLowerCase() === name.toLowerCase())) throw new Error('A note with that name already exists.');
    return name;
  }

  create(value: string) {
    const note = this.session(this.filename(value), '');
    const next = [...this.notes, note];
    this.write(next.map(note => ({ name: note.path, contents: note.savedText })));
    this.notes = next;
    return note;
  }

  rename(note: DocumentSession, value: string) {
    if (!this.notes.includes(note)) throw new Error('This note cannot be renamed.');
    const name = this.filename(value, note);
    this.write(this.notes.map(item => ({ name: item === note ? name : item.path, contents: item.savedText })));
    note.path = name;
  }

  remove(note: DocumentSession) {
    if (!this.notes.includes(note)) throw new Error('This note cannot be deleted.');
    const next = this.notes.filter(item => item !== note);
    this.write(next.map(item => ({ name: item.path, contents: item.savedText })));
    this.notes = next; note.dispose();
  }
}
