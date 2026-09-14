import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const paper = readFileSync(new URL('../fixtures/paper.pdf', import.meta.url)).toString('base64');
const mathExample = readFileSync(new URL('../fixtures/from-codes-to-proofs.md', import.meta.url), 'utf8');
const codeExample = [
  '```rust\nfn square(x: i32) -> i32 { x * x }\n```',
  '```typescript\nconst name: string = "Feather";\n```',
  '```python\ndef square(x: int):\n    return x * x\n```',
  '```lean\ntheorem refl (α : Nat) : α = α := by rfl\n```',
  '```somelang\nint square(int x) { return x * x; }\n```',
].join('\n\n');

async function selectNativeMenu(page: Page, action: string) {
  await page.evaluate(action => (window as unknown as { testWorkspace: { emit: (event: string, payload: unknown) => void } }).testWorkspace.emit('menu-action', action), action);
}

test('standalone code highlights, autosaves, and keeps its language in the diff', async ({ page }) => {
  const files = [
    ['proof.lean', 'Lean', 'theorem', 'theorem refl (α : Nat) : α = α := by rfl'],
    ['main.rs', 'Rust', 'fn', 'fn main() { let count = 1; }'],
    ['app.ts', 'TypeScript', 'const', 'const count: number = 1;'],
    ['app.tsx', 'TSX', 'const', 'const App = () => <div />;'],
    ['index.js', 'JavaScript', 'const', 'const count = 1;'],
    ['index.jsx', 'JSX', 'const', 'const App = () => <div />;'],
    ['main.c', 'C', 'return', 'int main() { return 0; }'],
    ['script.py', 'Python', 'def', 'def main():\n    return 1'],
  ];
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'My notes' })).toBeVisible();
  await page.getByRole('button', { name: 'Preview view', exact: true }).click();
  await page.evaluate(files => {
    const state = (window as unknown as { testWorkspace: { files: Record<string, { contents: string; version: string }>; emit: (event: string, payload: unknown) => void } }).testWorkspace;
    for (const [path, , , contents] of files) state.files[path] = { contents, version: '1' };
    state.emit('workspace-changed', [1, []]);
  }, files);
  for (const [path, language, keyword, contents] of files) {
    await page.getByRole('treeitem', { name: `· ${path}`, exact: true }).click();
    const source = page.getByRole('textbox', { name: `${language} source`, exact: true });
    await expect(source).toBeVisible();
    await expect(source.locator('.syntax-keyword').filter({ hasText: new RegExp(`^${keyword}$`) }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export PDF', exact: true })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Document preview' })).toHaveCount(0);
    await source.fill(contents + '\n');
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  }
  await page.getByRole('treeitem', { name: '· main.rs', exact: true }).click();
  await page.getByRole('button', { name: 'Git diff', exact: true }).click();
  const current = page.getByRole('textbox', { name: 'Current file in Git diff' });
  await expect(current.locator('.syntax-keyword').filter({ hasText: /^fn$/ })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Git HEAD version' }).locator('.syntax-keyword').filter({ hasText: /^fn$/ })).toBeVisible();
  await current.fill('fn main() { let count = 42; }\n');
  await page.getByRole('button', { name: 'Source view', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Rust source' })).toContainText('42');
  await page.getByRole('treeitem', { name: 'M notes.md', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export PDF', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Find a file/ }).click();
  await page.getByRole('textbox', { name: 'Find a file', exact: true }).fill('main.rs');
  await page.getByRole('option').first().click();
  await expect(page.getByRole('textbox', { name: 'Rust source' })).toContainText('42');
  await page.screenshot({ path: 'artifacts/feather-code-editor.png' });
  expect(errors).toEqual([]);
});

test('creates and reopens Cargo.toml, env, extensionless, and unfamiliar files as plain text', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'My notes' })).toBeVisible();
  for (const path of ['Cargo.toml', '.env', 'LICENSE', 'custom.unfamiliar']) {
    await page.getByRole('button', { name: 'New file', exact: true }).click();
    await page.getByLabel('File name').fill(path);
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const source = page.getByRole('textbox', { name: 'Plain text source' });
    await expect(source).toBeVisible();
    await source.fill('# Plain text\nAPP_ENV=development\n');
    await expect(page.getByRole('button', { name: 'Export PDF', exact: true })).toHaveCount(0);
    await expect(source.locator('.syntax-keyword')).toHaveCount(0);
    await page.getByRole('treeitem', { name: 'M notes.md', exact: true }).click();
    await page.getByRole('treeitem', { name: `· ${path}`, exact: true }).click();
    await expect(source).toContainText('APP_ENV=development');
  }
});

test('source and Markdown preview scroll continuously in both directions without feedback', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'My notes' })).toBeVisible();
  const text = Array.from({ length: 50 }, (_, index) => `## Section ${index}\n\n` + `Paragraph ${index}: ` + 'Words that wrap across several lines in both panes. '.repeat(14) + '\n\n$$x^2 + y^2 = z^2$$').join('\n\n');
  await page.getByRole('textbox', { name: 'Markdown source' }).fill(text);
  await expect(page.locator('.markdown-body h2')).toHaveCount(50);
  const selectors = ['.source-pane .cm-scroller', '.preview-scroll'];
  await page.getByRole('textbox', { name: 'Markdown source' }).press('ControlOrMeta+Home');
  await expect.poll(() => page.locator(selectors[0]).evaluate(element => element.scrollTop)).toBeLessThan(30);
  await page.locator(selectors[0]).evaluate(element => { element.scrollTop = 0; });
  await expect.poll(() => page.locator(selectors[0]).evaluate(element => element.scrollTop)).toBeLessThan(2);
  await expect.poll(() => page.locator(selectors[1]).evaluate(element => element.scrollTop)).toBeLessThan(2);
  for (const side of [0, 1]) {
    const motion = await page.evaluate(async ({ selectors, side }) => {
      const panes = selectors.map(selector => document.querySelector<HTMLElement>(selector)!);
      const source = panes[side], follower = panes[1 - side];
      source.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
      const start = source.scrollTop;
      const positions: number[] = [];
      for (let frame = 0; frame < 40; frame++) {
        if (frame < 20) source.scrollTop += 5;
        await new Promise(requestAnimationFrame);
        positions.push(follower.scrollTop);
      }
      return { positions, distance: source.scrollTop - start };
    }, { selectors, side });
    const steps = motion.positions.slice(1).map((position, index) => position - motion.positions[index]);
    expect(steps.filter(step => step > .1).length).toBeGreaterThan(15);
    expect(Math.min(...steps)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...steps)).toBeLessThan(40);
    expect(motion.distance).toBeCloseTo(100, 0);
  }
  // Both document ends line up even though the rendered and source heights differ.
  await page.locator(selectors[0]).evaluate(element => { element.dispatchEvent(new WheelEvent('wheel')); element.scrollTop = element.scrollHeight; });
  await expect.poll(() => page.locator(selectors[1]).evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThan(2);
  await page.locator(selectors[1]).evaluate(element => { element.dispatchEvent(new WheelEvent('wheel')); element.scrollTop = 0; });
  await expect.poll(() => page.locator(selectors[0]).evaluate(element => element.scrollTop)).toBeLessThan(2);
  await page.getByRole('button', { name: 'Synchronize scrolling' }).click();
  const before = await page.locator(selectors[1]).evaluate(element => element.scrollTop);
  await page.locator(selectors[0]).evaluate(element => { element.scrollTop = 200; });
  await expect(page.locator(selectors[0])).toHaveJSProperty('scrollTop', 200);
  expect(await page.locator(selectors[1]).evaluate(element => element.scrollTop)).toBeCloseTo(before, 0);
});

test('built-in code highlighting works in source, worker preview, diff, themes, and PDF export', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'My notes' })).toBeVisible();
  const source = page.getByRole('textbox', { name: 'Markdown source' });
  await source.fill(codeExample);
  for (const language of ['rust', 'typescript', 'python', 'lean', 'c']) {
    await expect(page.locator(`.markdown-body pre[data-code-language="${language}"] .syntax-keyword`).first()).toBeVisible();
  }
  const editorKeyword = source.locator('.syntax-keyword').filter({ hasText: /^fn$/ }).first();
  const previewKeyword = page.locator('pre[data-code-language="rust"] .syntax-keyword').first();
  await expect(editorKeyword).toBeVisible();
  await expect(previewKeyword).toHaveCSS('color', await editorKeyword.evaluate(element => getComputedStyle(element).color));
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('combobox', { name: 'UI profile' }).selectOption('github');
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.locator('.popover-dismiss').click({ position: { x: 20, y: 200 } });
  await expect(editorKeyword).toHaveCSS('color', 'rgb(255, 123, 114)');
  await expect(previewKeyword).toHaveCSS('color', 'rgb(255, 123, 114)');
  await page.screenshot({ path: 'artifacts/feather-syntax-dark.png' });
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { testWorkspace: { exported: string } }).testWorkspace.exported)).toContain('data-code-language="c"');
  await expect.poll(() => page.evaluate(() => (window as unknown as { testWorkspace: { exported: string } }).testWorkspace.exported)).toContain('syntax-keyword');
  await page.getByRole('button', { name: 'Git diff', exact: true }).click();
  const current = page.getByRole('textbox', { name: 'Current file in Git diff' });
  await expect(current.locator('.syntax-keyword').filter({ hasText: /^fn$/ }).first()).toBeVisible();
  await current.fill('```somelang\nint main() { return 42; }\n```');
  await expect(current.locator('.syntax-type').first()).toHaveText('int');
  await page.getByRole('button', { name: 'Split view', exact: true }).click();
  await expect(page.locator('pre[data-code-language="c"] .syntax-number')).toHaveText('42');
  await source.fill('```text\nint main() { return 42; }\n```');
  await expect(page.locator('.markdown-body .syntax-keyword')).toHaveCount(0);
  await expect(source.locator('.syntax-keyword')).toHaveCount(0);
  expect(errors).toEqual([]);
});

// Exercise the desktop UI through the IPC boundary. Actual disk semantics are
// covered by feather-core integration tests; this transport is a test fixture.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ paper }) => {
    const state = {
      files: { 'notes.md': { contents: '# My notes\n\n[Proof](./proof.md)', version: '1' }, 'proof.md': { contents: '# The proof\n\n$x^2$', version: '1' }, 'paper.tex': { contents: '\\documentclass{article}\n\\begin{document}A small observation\\end{document}', version: '1' } } as Record<string, { contents: string; version: string }>,
      dirs: new Set<string>(), callbacks: new Map<number, (event: unknown) => void>(), listeners: new Map<string, number>(), counter: 0, compileFailure: false, terminalInput: '', terminalDirectory: '', exported: '',
      emit(event: string, payload: unknown) { this.callbacks.get(this.listeners.get(event)!)?.({ event, payload, id: 1 }); },
    };
    Object.assign(window, {
      isTauri: true, testWorkspace: state,
      __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener() {} },
      __TAURI_INTERNALS__: {
        metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
        transformCallback(fn: (event: unknown) => void) { const id = ++state.counter; state.callbacks.set(id, fn); return id; },
        async invoke(command: string, args: Record<string, string | number>) {
          if (command === 'plugin:event|listen') { state.listeners.set(String(args.event), Number(args.handler)); return 1; }
          if (command.startsWith('plugin:')) return;
          const path = String(args.path || '');
          if (command === 'open_requested' || command === 'choose_workspace') return { id: 1, name: 'research', root: '/research', selected: 'notes.md', watchWarning: null };
          if (command === 'list_directory') return [...Object.keys(state.files), ...state.dirs].filter(p => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '') === path).map(p => ({ path: p, name: p.split('/').pop(), isDir: state.dirs.has(p) }));
          if (command === 'search_files') return { paths: Object.keys(state.files).filter(p => p.includes(String(args.query))), truncated: false };
          if (command === 'compile_tex') return state.compileFailure ? { pdf: null, log: 'Undefined control sequence: invalid' } : { pdf: paper, log: 'Compiled successfully.' };
          if (command === 'git_baseline') return { contents: path.endsWith('.md') ? '# Original notes\n\nA previous paragraph.' : state.files[path]?.contents || '', revision: 'a1b2c3d4', isNew: false };
          if (command === 'terminal_start') { state.terminalDirectory = path; state.emit('terminal-output', [1, Array.from(new TextEncoder().encode('bash$ '))]); return { id: 1, cwd: '/research/' + path }; }
          if (command === 'terminal_write') { state.terminalInput += args.data; return; }
          if (command === 'export_markdown') { state.exported = String(args.html); return '/research/notes.pdf'; }
          if (command === 'read_document') { if (!state.files[path]) throw new Error('File not found'); return { path, ...state.files[path] }; }
          if (command === 'save_document') { const file = state.files[path]; if (!file || file.version !== args.version) throw new Error('CONFLICT: Changed on disk'); file.contents = String(args.contents); file.version = String(Number(file.version) + 1); return file.version; }
          if (command === 'create_entry') { if (state.files[path] || state.dirs.has(path)) throw new Error('Name exists'); if (args.directory) state.dirs.add(path); else state.files[path] = { contents: '', version: '1' }; }
          if (command === 'rename_entry' || command === 'duplicate_entry') { state.files[String(args.destination)] = { ...state.files[path] }; if (command === 'rename_entry') delete state.files[path]; }
          if (command === 'trash_entry') delete state.files[path];
        },
      },
    });
  }, { paper });
});

test('open, autosave, follow a link, quick open, create, rename and trash', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'My notes' })).toBeVisible();
  const source = page.getByRole('textbox', { name: 'Markdown source' });
  await source.fill('# Edited notes\n\n[Proof](./proof.md)');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Proof', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The proof' })).toBeVisible();
  await page.getByRole('button', { name: /Find a file/ }).click();
  await page.getByRole('textbox', { name: 'Find a file', exact: true }).fill('notes');
  await page.getByRole('option').first().click();
  await expect(page.getByRole('heading', { name: 'Edited notes' })).toBeVisible();
  await page.getByRole('button', { name: 'New file', exact: true }).click();
  await page.getByLabel('File name').fill('thought.md'); await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('.document-title strong')).toHaveText('thought.md');
  await source.fill('# A thought');
  await page.getByRole('treeitem', { name: 'M thought.md', exact: true }).hover();
  await page.getByRole('button', { name: 'Actions for thought.md' }).click();
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await page.getByLabel('File name').fill('better.md'); await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await expect(page.locator('.document-title strong')).toHaveText('better.md');
  await expect(page.getByRole('heading', { name: 'A thought' })).toBeVisible();
  await page.getByRole('treeitem', { name: 'M better.md', exact: true }).hover();
  await page.getByRole('button', { name: 'Actions for better.md' }).click();
  await page.getByRole('menuitem', { name: 'Move to trash' }).click();
  await page.getByRole('button', { name: 'Move to trash', exact: true }).click();
  await expect(page.locator('.document-title strong')).toHaveText('Scratchpad.md');
});

test('outside edits preserve dirty text and conflict review can retain my version', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'My notes' })).toBeVisible();
  const source = page.getByRole('textbox', { name: 'Markdown source' });
  await source.evaluate(element => {
    // Inject the outside edit in the input event, before the 500 ms autosave.
    // A separate browser round trip can lose that race on a busy CI runner.
    element.addEventListener('input', () => {
      const state = (window as unknown as { testWorkspace: { files: Record<string, { contents: string; version: string }>; emit: (event: string, payload: unknown) => void } }).testWorkspace;
      state.files['notes.md'] = { contents: '# Outside edit', version: '2' }; state.emit('workspace-changed', [1, ['notes.md']]);
    }, { once: true });
  });
  await source.fill('# My pending edits');
  await page.getByRole('button', { name: 'Review disk' }).click();
  await expect(page.getByRole('dialog')).toContainText('# My pending edits');
  await expect(page.getByRole('dialog')).toContainText('# Outside edit');
  await page.getByRole('button', { name: 'Save my version' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'My pending edits' })).toBeVisible();
});

test('on-demand Git diff, terminal in document directory, zoom, and Markdown PDF export', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'My notes' })).toBeVisible();
  await page.getByRole('button', { name: 'Git diff', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Git diff' })).toBeVisible();
  await expect(page.locator('.cm-merge-a')).toContainText('Original notes');
  await expect(page.locator('.cm-merge-b')).toContainText('My notes');
  await expect(page.getByRole('button', { name: 'Next change' })).toBeEnabled();
  await page.screenshot({ path: 'artifacts/feather-git-diff.png' });
  await page.getByRole('button', { name: 'Split view', exact: true }).click();
  await page.keyboard.press('Control+Backquote');
  await expect(page.getByRole('region', { name: 'Bash terminal', exact: true })).toBeVisible();
  await expect(page.getByLabel('Bash terminal input')).toBeFocused();
  await page.screenshot({ path: 'artifacts/feather-terminal.png' });
  await page.keyboard.type('pwd'); await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => (window as unknown as { testWorkspace: { terminalInput: string } }).testWorkspace.terminalInput)).toBe('pwd\r');
  expect(await page.evaluate(() => (window as unknown as { testWorkspace: { terminalDirectory: string } }).testWorkspace.terminalDirectory)).toBe('');
  await page.keyboard.press('Control+Backquote');
  await expect(page.getByRole('region', { name: 'Bash terminal', exact: true })).toBeHidden();
  await page.keyboard.press('ControlOrMeta+=');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reset zoom' })).toHaveText('110%');
  await page.getByRole('button', { name: 'Reset zoom' }).click();
  await page.locator('.popover-dismiss').click({ position: { x: 20, y: 200 } });
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { testWorkspace: { exported: string } }).testWorkspace.exported)).toContain('My notes');
});

test('edit the current Git version, autosave, and carry changes between diff and source', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'My notes' })).toBeVisible();
  await page.getByRole('button', { name: 'Git diff', exact: true }).click();
  const current = page.getByRole('textbox', { name: 'Current file in Git diff' });
  const head = page.getByRole('textbox', { name: 'Git HEAD version' });
  await expect(current).toHaveAttribute('contenteditable', 'true');
  await expect(head).toHaveAttribute('contenteditable', 'false');
  await current.fill('# Written in the diff\n\nA new paragraph.');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { testWorkspace: { files: Record<string, { contents: string }> } }).testWorkspace.files['notes.md'].contents)).toBe('# Written in the diff\n\nA new paragraph.');
  await expect(head).toContainText('Original notes');
  await page.getByRole('button', { name: 'Refresh Git diff' }).click();
  await expect(current).toContainText('Written in the diff');
  await page.getByRole('button', { name: 'Split view', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Written in the diff' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Markdown source' }).fill('# Back in the source');
  await page.getByRole('button', { name: 'Git diff', exact: true }).click();
  await expect(current).toContainText('Back in the source');
  await current.fill('# Original notes\n\nA previous paragraph.');
  await expect(page.getByText('No changes from HEAD', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next change' })).toBeDisabled();
  // Switching files flushes the diff's pending write just like the source editor.
  await current.fill('# Saved before switching');
  await page.getByRole('treeitem', { name: 'M proof.md', exact: true }).click();
  await expect(current).toContainText('The proof');
  await page.getByRole('treeitem', { name: 'M notes.md', exact: true }).click();
  await expect(current).toContainText('Saved before switching');
  expect(errors).toEqual([]);
});

test('diff undo survives appearance changes and Vim uses the current document', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'My notes' })).toBeVisible();
  await page.getByRole('button', { name: 'Git diff', exact: true }).click();
  const current = page.getByRole('textbox', { name: 'Current file in Git diff' });
  await current.focus(); await page.keyboard.press('Control+Home'); await page.keyboard.type('Added ');
  await expect(current).toContainText('Added # My notes');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.locator('.popover-dismiss').click({ position: { x: 20, y: 200 } });
  await current.focus(); await page.keyboard.press('ControlOrMeta+z');
  await expect(current).not.toContainText('Added');
  await expect(current).toContainText('My notes');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('switch', { name: 'Vim mode' }).check();
  await page.locator('.popover-dismiss').click({ position: { x: 20, y: 200 } });
  await expect(page.locator('.cm-merge-b')).toContainText('--NORMAL--');
  await current.focus(); await page.keyboard.type('ggiVim '); await page.keyboard.press('Escape');
  await expect(current).toContainText('Vim # My notes');
  await page.keyboard.type(':w'); await page.keyboard.press('Enter');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/feather-editable-diff.png' });
  await page.getByRole('button', { name: 'Split view', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Markdown source' })).toContainText('Vim # My notes');
  expect(errors).toEqual([]);
});

test('outside changes preserve dirty edits made in the diff', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'My notes' })).toBeVisible();
  await page.getByRole('button', { name: 'Git diff', exact: true }).click();
  const current = page.getByRole('textbox', { name: 'Current file in Git diff' });
  await current.evaluate(element => {
    element.addEventListener('input', () => {
      const state = (window as unknown as { testWorkspace: { files: Record<string, { contents: string; version: string }>; emit: (event: string, payload: unknown) => void } }).testWorkspace;
      state.files['notes.md'] = { contents: '# Outside edit', version: '2' }; state.emit('workspace-changed', [1, ['notes.md']]);
    }, { once: true });
  });
  await current.fill('# Pending diff edits');
  await page.getByRole('button', { name: 'Review disk' }).click();
  await expect(page.getByRole('dialog')).toContainText('# Pending diff edits');
  await expect(page.getByRole('dialog')).toContainText('# Outside edit');
  await page.getByRole('button', { name: 'Use disk version' }).click();
  await expect(current).toContainText('Outside edit');
  await expect(current).not.toContainText('Pending diff edits');
  await page.getByRole('button', { name: 'Split view', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Outside edit' })).toBeVisible();
});


test('TeX preview draws selectable PDF pages and keeps the last PDF on compile failure', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('treeitem', { name: 'T paper.tex', exact: true }).click();
  await expect(page.getByText('Page 1 of 1', { exact: true })).toBeVisible();
  await expect(page.locator('.pdfViewer canvas')).toBeVisible();
  await expect(page.locator('.pdfViewer .textLayer')).toContainText('A small observation');
  await page.screenshot({ path: 'artifacts/feather-latex-preview.png' });
  await page.evaluate(() => { (window as unknown as { testWorkspace: { compileFailure: boolean } }).testWorkspace.compileFailure = true; });
  await page.getByRole('button', { name: 'Compile again', exact: true }).click();
  await expect(page.getByText('Undefined control sequence: invalid')).toBeVisible();
  await expect(page.locator('.pdfViewer canvas')).toBeVisible();
  await expect(page.locator('.pdfViewer .textLayer')).toContainText('A small observation');
  await page.getByRole('treeitem', { name: 'M notes.md', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My notes' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the reported multiline FRI equations render in both preview and PDF export', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'My notes' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Markdown source' }).fill(mathExample);
  await expect(page.getByRole('heading', { name: 'From codes to proofs' })).toBeVisible();
  await expect(page.locator('.katex-error')).toHaveCount(0);
  await expect(page.locator('.markdown-body > p').filter({ hasText: /^All arithmetic is in the finite field/ })).toHaveCount(1);
  await page.getByRole('heading', { name: 'Distance and lists in soundness' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/feather-fri-equations.png' });
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
  await expect(page.getByText('Saved /research/notes.pdf')).toBeVisible();
  const html = await page.evaluate(() => (window as unknown as { testWorkspace: { exported: string } }).testWorkspace.exported);
  expect(html).not.toContain('katex-error');
  expect(html).toContain('sampling outside the evaluation domain');
});

test('collapse the workspace without losing expanded folders and keep Scratchpad at the bottom', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'My notes' })).toBeVisible();
  await page.evaluate(() => {
    const state = (window as unknown as { testWorkspace: { dirs: Set<string>; files: Record<string, { contents: string; version: string }>; emit: (event: string, payload: unknown) => void } }).testWorkspace;
    state.dirs.add('chapter'); state.files['chapter/part.md'] = { contents: '# A chapter', version: '1' };
    for (let i = 0; i < 50; i++) state.files[`extra-${i}.md`] = { contents: '', version: '1' };
    state.emit('workspace-changed', [1, []]);
  });
  await page.getByRole('treeitem', { name: 'chapter', exact: true }).click();
  const nested = page.getByRole('treeitem', { name: 'M part.md', exact: true });
  await expect(nested).toBeVisible();
  const root = page.getByRole('button', { name: 'research', exact: true });
  await root.click();
  await expect(root).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('tree', { name: 'Files' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'New file', exact: true })).toBeVisible();
  await root.press('Enter');
  await expect(nested).toBeVisible();
  await page.setViewportSize({ width: 1100, height: 600 });
  const footer = page.getByRole('button', { name: 'Scratchpad', exact: true });
  await expect(footer).toBeInViewport();
  const bounds = await footer.boundingBox();
  expect(bounds!.x).toBe(8);
  expect(600 - bounds!.y - bounds!.height).toBe(8);
  await footer.click();
  await expect(page.locator('.document-title strong')).toHaveText('Scratchpad.md');
});

test('Zen mode persists, preserves writing, and keeps settings and an exit available', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'My notes' })).toBeVisible();
  const source = page.getByRole('textbox', { name: 'Markdown source' });
  await source.focus(); await page.keyboard.press('Control+Home'); await page.keyboard.type('Before zen ');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('switch', { name: 'Zen mode' }).check();
  await page.locator('.popover-dismiss').click({ position: { x: 20, y: 200 } });
  await expect(page.locator('.app-header')).toBeHidden();
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(source).toContainText('Before zen # My notes');
  await source.focus(); await page.keyboard.press('ControlOrMeta+z');
  await expect(source).not.toContainText('Before zen');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.getByRole('switch', { name: 'Vim mode' }).check();
  await page.locator('.popover-dismiss').click({ position: { x: 20, y: 200 } });
  await expect(page.locator('.source-pane')).toContainText('--NORMAL--');
  await source.focus(); await page.keyboard.type('ggiZen '); await page.keyboard.press('Escape');
  await expect(source).toContainText('Zen # My notes');
  await expect(page.getByRole('button', { name: 'Exit Zen mode' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/feather-zen.png' });
  await page.keyboard.type(':w'); await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => (window as unknown as { testWorkspace: { files: Record<string, { contents: string }> } }).testWorkspace.files['notes.md'].contents)).toBe('Zen # My notes\n\n[Proof](./proof.md)');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Exit Zen mode' })).toBeVisible();
  await expect(page.locator('.app-header')).toBeHidden();
  await page.getByRole('button', { name: 'Exit Zen mode' }).click();
  await expect(page.locator('.app-header')).toBeVisible();
  await expect(page.locator('.sidebar')).toBeVisible();
});

test('UI profiles recolor the editor and diff, with green additions and red deletions', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'My notes' })).toBeVisible();
  await page.getByRole('button', { name: 'Git diff', exact: true }).click();
  const current = page.getByRole('textbox', { name: 'Current file in Git diff' });
  await current.focus(); await page.keyboard.press('Control+Home'); await page.keyboard.type('My edit ');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('combobox', { name: 'UI profile' }).selectOption('github');
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('.app-header')).toHaveCSS('background-color', 'rgb(13, 17, 23)');
  await expect(page.locator('.cm-merge-b .cm-changedLine').first()).toHaveCSS('background-color', 'rgb(18, 47, 33)');
  await expect(page.locator('.cm-merge-a .cm-changedLine').first()).toHaveCSS('background-color', 'rgb(61, 27, 32)');
  await page.screenshot({ path: 'artifacts/feather-github-settings.png' });
  await page.getByRole('combobox', { name: 'UI profile' }).selectOption('midnight');
  await expect(page.locator('.app-header')).toHaveCSS('background-color', 'rgb(23, 25, 35)');
  await page.getByRole('combobox', { name: 'UI profile' }).selectOption('github');
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await expect(page.locator('.cm-merge-a .cm-changedLine').first()).toHaveCSS('background-color', 'rgb(255, 235, 233)');
  await expect(page.locator('.cm-merge-b .cm-changedLine').first()).toHaveCSS('background-color', 'rgb(218, 251, 225)');
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.locator('.popover-dismiss').click({ position: { x: 20, y: 200 } });
  await current.focus(); await page.keyboard.press('ControlOrMeta+z');
  await expect(current).not.toContainText('My edit');
  await expect(current).toContainText('My notes');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'UI profile' })).toHaveValue('github');
  await expect(page.locator('.app-header')).toHaveCSS('background-color', 'rgb(13, 17, 23)');
});

test('guide navigation handles Windows line endings', async ({ page }) => {
  const guide = readFileSync(new URL('../../frontend/src/guide.md', import.meta.url), 'utf8').replace(/\r?\n/g, '\r\n');
  let served = false;
  await page.route(/\/src\/guide\.md\?.*\braw\b/, route => {
    served = true;
    return route.fulfill({ contentType: 'text/javascript', body: `export default ${JSON.stringify(guide)};` });
  });
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'My notes' })).toBeVisible();
  expect(served).toBe(true);
  await selectNativeMenu(page, 'guide:LaTeX and PDF');
  await expect(page.getByRole('heading', { name: 'LaTeX and PDF', exact: true })).toBeInViewport();
  await selectNativeMenu(page, 'guide:Appearance and shortcuts');
  await expect(page.getByRole('heading', { name: 'Appearance and shortcuts', exact: true })).toBeInViewport();
});

test('Ctrl Shift Z redoes edits with Windows keybindings', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'platform', { get: () => 'Win32' }));
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'My notes' })).toBeVisible();
  const source = page.getByRole('textbox', { name: 'Markdown source' });
  await source.focus(); await page.keyboard.press('Control+Home'); await page.keyboard.type('Added ');
  await page.keyboard.press('Control+z'); await expect(source).not.toContainText('Added');
  await page.keyboard.press('Control+Shift+z'); await expect(source).toContainText('Added # My notes');
});

test('Native Features menu opens the guide, jumps to examples, exports, and returns to the saved document', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'My notes' })).toBeVisible();
  const source = page.getByRole('textbox', { name: 'Markdown source' });
  await source.fill('# Notes before the guide');
  await expect(page.getByRole('button', { name: 'Features', exact: true })).toHaveCount(0);
  await selectNativeMenu(page, 'guide');
  await expect(page.getByRole('heading', { name: 'Feather feature guide', exact: true })).toBeInViewport();
  await expect(page.locator('.document-title strong')).toHaveText('Feather Guide.md');
  await expect(source).toHaveAttribute('aria-readonly', 'true');
  await expect(page.getByRole('tree', { name: 'Files' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { testWorkspace: { files: Record<string, { contents: string }> } }).testWorkspace.files['notes.md'].contents)).toBe('# Notes before the guide');
  await expect(page.locator('.katex-error')).toHaveCount(0);
  await expect(page.locator('.markdown-body .katex')).toHaveCount(3);
  await selectNativeMenu(page, 'guide:LaTeX and PDF');
  await expect(page.getByRole('heading', { name: 'LaTeX and PDF', exact: true })).toBeInViewport();
  await page.screenshot({ path: 'artifacts/feather-feature-guide.png' });
  await page.getByRole('button', { name: 'Source view', exact: true }).click();
  await selectNativeMenu(page, 'guide:Saving and exporting');
  await expect(page.getByRole('heading', { name: 'Saving and exporting', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { testWorkspace: { exported: string } }).testWorkspace.exported)).toContain('Feather feature guide');
  await page.evaluate(() => {
    const state = (window as unknown as { testWorkspace: { files: Record<string, { contents: string; version: string }>; emit: (event: string, payload: unknown) => void } }).testWorkspace;
    state.files['notes.md'] = { contents: '# Changed while reading the guide', version: '3' };
    state.emit('workspace-changed', [1, ['notes.md']]);
  });
  await page.getByRole('button', { name: 'Back', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'Changed while reading the guide' })).toBeVisible();
  await expect(source).not.toHaveAttribute('aria-readonly', 'true');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('Zen shortcut leaves Undo and Redo intact in source and diff, and works through the native menu', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'My notes' })).toBeVisible();
  const source = page.getByRole('textbox', { name: 'Markdown source' });
  await source.focus(); await page.keyboard.press('Control+Home'); await page.keyboard.type('Added ');
  await page.keyboard.press('ControlOrMeta+j');
  await expect(page.locator('.app-header')).toBeHidden();
  await expect(source).toContainText('Added # My notes');
  await source.dispatchEvent('keydown', {
    key: 'j', code: 'KeyJ', repeat: true,
    metaKey: process.platform === 'darwin', ctrlKey: process.platform !== 'darwin',
  });
  await expect(page.locator('.app-header')).toBeHidden();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(source).not.toContainText('Added');
  await expect(page.locator('.app-header')).toBeHidden();
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(source).toContainText('Added # My notes');
  await page.keyboard.press('ControlOrMeta+j');
  await expect(page.locator('.app-header')).toBeVisible();
  await page.getByRole('button', { name: 'Git diff', exact: true }).click();
  const current = page.getByRole('textbox', { name: 'Current file in Git diff' });
  await current.focus(); await page.keyboard.press('ControlOrMeta+j');
  await expect(page.locator('.app-header')).toBeHidden();
  await expect(current).toContainText('Added # My notes');
  await page.evaluate(() => (window as unknown as { testWorkspace: { emit: (event: string, payload: unknown) => void } }).testWorkspace.emit('menu-action', 'zen'));
  await expect(page.locator('.app-header')).toBeVisible();
  await page.getByRole('button', { name: 'Keyboard shortcuts', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'A few useful shortcuts' });
  await expect(dialog.locator('.shortcut-list > div').filter({ hasText: 'Toggle Zen mode' })).toContainText(process.platform === 'darwin' ? '⌘ J' : 'Ctrl J');
  await expect(dialog).not.toContainText('Stay with your words.');
});

test('Native Features menu works without a workspace and remains available in Zen mode', async ({ page }) => {
  await page.addInitScript(() => {
    const internals = (window as unknown as { __TAURI_INTERNALS__: { invoke: (command: string, args: Record<string, unknown>) => Promise<unknown> } }).__TAURI_INTERNALS__;
    const invoke = internals.invoke;
    internals.invoke = (command, args) => command === 'open_requested' ? Promise.resolve(null) : invoke(command, args);
  });
  await page.goto('/');
  const source = page.getByRole('textbox', { name: 'Markdown source' });
  await source.fill('# My scratch notes');
  await selectNativeMenu(page, 'guide:Markdown and math');
  await expect(page.getByRole('heading', { name: 'Markdown and math', exact: true })).toBeInViewport();
  await page.keyboard.press('ControlOrMeta+j');
  await expect(page.locator('.app-header')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Features', exact: true })).toHaveCount(0);
  await selectNativeMenu(page, 'shortcuts');
  await expect(page.getByRole('dialog', { name: 'A few useful shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await selectNativeMenu(page, 'guide:Appearance and shortcuts');
  await expect(page.getByRole('heading', { name: 'Appearance and shortcuts', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'Back', exact: false }).click();
  await expect(source).toContainText('# My scratch notes');
  await expect(page.locator('.document-title strong')).toHaveText('Scratchpad.md');
});

test('Vim Escape remains local to the editable diff while dialogs and Bash keep Escape', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'My notes' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('switch', { name: 'Vim mode' }).check();
  await page.locator('.popover-dismiss').click({ position: { x: 20, y: 200 } });
  await page.getByRole('button', { name: 'Git diff', exact: true }).click();
  const current = page.getByRole('textbox', { name: 'Current file in Git diff' });
  await expect(page.locator('.cm-merge-b')).toContainText('--NORMAL--');
  await current.focus(); await page.keyboard.press('ControlOrMeta+j');
  await page.keyboard.type('ggiDiff '); await page.keyboard.press('Escape');
  await expect(page.locator('.cm-merge-b')).toContainText('--NORMAL--');
  const prevented = await current.evaluate(element => {
    const event = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true });
    element.dispatchEvent(event); return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
  await expect(current).toContainText('Diff # My notes');
  await selectNativeMenu(page, 'shortcuts');
  await expect(page.getByRole('dialog', { name: 'A few useful shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('Control+Backquote');
  await expect(page.getByLabel('Bash terminal input')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => (window as unknown as { testWorkspace: { terminalInput: string } }).testWorkspace.terminalInput)).toBe('\u001b');
  await expect(page.locator('.app-header')).toBeHidden();
});
