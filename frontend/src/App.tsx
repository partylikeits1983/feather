import { useEffect, useRef, useState } from 'preact/hooks';
import { EditorView } from '@codemirror/view';
import { api, desktop } from './api';
import { DocumentSession } from './state/document';
import { welcome } from './welcome';
import guideText from './guide.md?raw';
import { basename, dirname, isMarkdown, hasPreview, canExportPdf, fileGlyph, resolveRelative, type Appearance, type Entry, type Workspace } from './types';
import { Editor } from './editor/Editor';
import { fileLanguage } from './syntax/languages';
import { Preview, TexPreview, type PreviewHandle } from './preview/Preview';
import { synchronizeScroll } from './preview/scroll-sync';
import { Explorer } from './explorer/Explorer';
import { Icon, type IconName } from './components/Icon';
import { Dialog } from './components/Dialog';
import { lazy, Suspense } from 'preact/compat';
const GitDiff = lazy(() => import('./git/GitDiff'));
const TerminalPanel = lazy(() => import('./terminal/TerminalPanel'));

function stored(key: string, fallback: string) { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } }
function store(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* appearance is optional */ } }
const modifier = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
type FileAction = { kind: 'file' | 'folder' | 'rename' | 'duplicate' | 'copy'; path: string };

export function App() {
  const scratch = useRef<DocumentSession>();
  if (!scratch.current) scratch.current = new DocumentSession('Scratchpad.md', stored('feather.scratchpad', welcome), 'scratch', async text => {
    localStorage.setItem('feather.scratchpad', text); return 'scratch';
  });
  const guide = useRef<DocumentSession>();
  if (!guide.current) guide.current = new DocumentSession('Feather Guide.md', guideText, 'guide', async () => 'guide');
  const guideReturn = useRef<{ session: DocumentSession; mode: 'split' | 'source' | 'preview' | 'diff' }>();
  const guideLine = useRef<number | null>(null);
  const [session, setSession] = useState(scratch.current), [workspace, setWorkspace] = useState<Workspace | null>(null);
  const current = useRef(session), workspaceRef = useRef(workspace); current.current = session; workspaceRef.current = workspace;
  const [status, setStatus] = useState(session.status), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [appearance, setAppearance] = useState<Appearance>(() => { const value = stored('feather.appearance', 'system'); return value === 'light' || value === 'dark' ? value : 'system'; });
  const [systemDark, setSystemDark] = useState(matchMedia('(prefers-color-scheme: dark)').matches);
  const dark = appearance === 'dark' || (appearance === 'system' && systemDark);
  const [sidebar, setSidebar] = useState(true), [mode, setMode] = useState<'split' | 'source' | 'preview' | 'diff'>('split'), [sync, setSync] = useState(true);
  const [zoom, setZoom] = useState(() => Math.max(.7, Math.min(1.6, Number(stored('feather.zoom', '1')) || 1)));
  const [terminalVisible, setTerminalVisible] = useState(false), [terminalStarted, setTerminalStarted] = useState(false), [exporting, setExporting] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(238), [split, setSplit] = useState(50), [revision, setRevision] = useState(0);
  const [settings, setSettings] = useState(false), [shortcuts, setShortcuts] = useState(false), [quick, setQuick] = useState(false);
  const [profile, setProfile] = useState(() => { const value = stored('feather.profile', 'feather'); return value === 'github' || value === 'midnight' ? value : 'feather'; });
  const [zen, setZen] = useState(() => stored('feather.zen', 'false') === 'true');
  const [workspaceCollapsed, setWorkspaceCollapsed] = useState(false);
  const [vimEnabled, setVimEnabled] = useState(() => stored('feather.vim', 'false') === 'true');
  const [query, setQuery] = useState(''), [results, setResults] = useState<string[]>([]), [truncated, setTruncated] = useState(false), [quickIndex, setQuickIndex] = useState(0);
  const [menu, setMenu] = useState<{ entry: Entry; x: number; y: number } | null>(null);
  const [action, setAction] = useState<FileAction | null>(null), [name, setName] = useState(''), [actionError, setActionError] = useState('');
  const [deleteEntry, setDeleteEntry] = useState<Entry | null>(null), [disk, setDisk] = useState<{ contents: string; version: string } | null>(null);
  const [locked, setLocked] = useState(false), navigating = useRef(false);
  const editor = useRef<EditorView | null>(null), diffEditor = useRef<EditorView | null>(null), preview = useRef<PreviewHandle | null>(null), panes = useRef<HTMLDivElement>(null);
  const stopScrollSync = useRef<() => void>();
  const isScratch = session === scratch.current, isGuide = session === guide.current, isLocal = isScratch || isGuide, tex = !isLocal && /\.tex$/i.test(session.path);

  const previewable = hasPreview(session.path), viewMode = previewable || mode === 'diff' ? mode : 'source';

  function connectScrollSync() {
    stopScrollSync.current?.(); stopScrollSync.current = undefined;
    if (sync && mode === 'split' && isMarkdown(session.path) && editor.current && preview.current) {
      stopScrollSync.current = synchronizeScroll(editor.current, preview.current);
    }
  }
  useEffect(() => { connectScrollSync(); return () => stopScrollSync.current?.(); }, [session, sync, mode]);

  useEffect(() => { const media = matchMedia('(prefers-color-scheme: dark)'); const update = () => setSystemDark(media.matches); media.addEventListener('change', update); return () => media.removeEventListener('change', update); }, []);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; store('feather.appearance', appearance); }, [appearance, dark]);
  useEffect(() => { document.documentElement.dataset.profile = profile; store('feather.profile', profile); }, [profile]);
  useEffect(() => { store('feather.zen', String(zen)); }, [zen]);
  useEffect(() => { setWorkspaceCollapsed(false); }, [workspace?.id]);
  useEffect(() => { store('feather.vim', String(vimEnabled)); }, [vimEnabled]);
  useEffect(() => {
    store('feather.zoom', String(zoom));
    if (desktop) void import('@tauri-apps/api/webview').then(({ getCurrentWebview }) => getCurrentWebview().setZoom(zoom)).catch(report);
    else { document.documentElement.style.zoom = String(zoom); document.body.style.height = `${100 / zoom}vh`; document.body.style.width = `${100 / zoom}vw`; }
  }, [zoom]);
  useEffect(() => { setStatus(session.status); return session.subscribe(kind => { if (kind === 'status') setStatus(session.status); }); }, [session]);
  useEffect(() => { document.title = `${basename(session.path)} — Feather`; if (desktop) void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().setTitle(document.title)).catch(() => {}); }, [session]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 7000); return () => clearTimeout(timer); }, [notice]);

  const report = (error: unknown) => setError(String(error).replace(/^Error: /, ''));
  function toggleTerminal() {
    if (!workspaceRef.current) { setNotice('Open a folder before starting a terminal.'); return; }
    setTerminalStarted(true); setTerminalVisible(value => { if (value) (mode === 'diff' ? diffEditor.current : editor.current)?.focus(); return !value; });
  }
  function toggleZen() {
    setZen(value => !value); setSettings(false); setMenu(null);
  }
  async function exportPdf() {
    if (exporting || !canExportPdf(current.current.path)) return; setExporting(true); setError('');
    try {
      const active = current.current, ws = workspaceRef.current;
      if (/\.tex$/i.test(active.path) && ws && active !== scratch.current) {
        const result = await api.compile(ws.id, active.path, active.text);
        if (!result.pdf) throw new Error(result.log || 'LaTeX compilation failed');
        const path = await api.savePdf(result.pdf, basename(active.path).replace(/\.tex$/i, '.pdf'));
        if (path) setNotice(`Saved ${path}`);
      } else {
        const { exportMarkdown } = await import('./preview/export');
        const path = await exportMarkdown(active.text, active.path, active === scratch.current || active === guide.current ? undefined : ws?.id);
        if (path) setNotice(`Saved ${path}`);
      }
    } catch (error) { report(error); } finally { setExporting(false); }
  }
  async function transition(task: () => Promise<void>) {
    if (navigating.current) return;
    navigating.current = true; setLocked(true); setError('');
    try { await current.current.flush(); await task(); }
    catch (error) { report(error); }
    finally { navigating.current = false; setLocked(false); }
  }
  function attach(next: DocumentSession) { current.current = next; setSession(next); setDisk(null); }
  async function load(ws: Workspace, path: string) {
    const doc = await api.read(ws.id, path);
    attach(new DocumentSession(doc.path, doc.contents, doc.version, (contents, version) => api.save(ws.id, doc.path, contents, version)));
  }
  async function activate(ws: Workspace) {
    workspaceRef.current = ws; setWorkspace(ws); setRevision(n => n + 1); attach(scratch.current!);
    if (ws.watchWarning) setNotice(ws.watchWarning);
    if (ws.selected) await load(ws, ws.selected);
    else {
      const entries = await api.list(ws.id);
      const first = entries.find(e => !e.isDir && /^readme\.md$/i.test(e.name)) || entries.find(e => !e.isDir && (hasPreview(e.path) || /\.txt$/i.test(e.path)));
      if (first) await load(ws, first.path);
    }
  }
  const openFile = (path: string) => void transition(async () => { if (workspaceRef.current) await load(workspaceRef.current, path); });
  const choose = (folder: boolean) => void transition(async () => { const ws = await api.choose(folder); if (ws) await activate(ws); });
  const requested = () => transition(async () => { const ws = await api.requested(); if (ws) await activate(ws); });
  const close = () => void transition(async () => { await api.quit(); });

  function openGuide(section = '') {
    setSettings(false);
    void transition(async () => {
      const line = section ? Math.max(1, guideText.split(/\r?\n/).findIndex(text => text === `## ${section}`) + 1) : 1;
      if (current.current !== guide.current) {
        guideReturn.current = { session: current.current, mode };
        guideLine.current = line; attach(guide.current!);
      } else if (mode === 'source' || mode === 'diff') {
        guideLine.current = line;
      } else {
        requestAnimationFrame(() => { scrollEditor(line, false); preview.current?.scrollToLine(line); });
      }
      setMode('split');
    });
  }
  function leaveGuide() {
    void transition(async () => {
      const previous = guideReturn.current;
      if (previous && previous.session !== scratch.current && workspaceRef.current) await load(workspaceRef.current, previous.session.path);
      else attach(scratch.current!);
      setMode(previous?.mode || 'split'); guideReturn.current = undefined; guideLine.current = null;
    });
  }

  const callbacks = useRef({ requested, choose, close, openFile, toggleZen, openGuide }); callbacks.current = { requested, choose, close, openFile, toggleZen, openGuide };
  useEffect(() => {
    if (!desktop) return;
    let cancelled = false; const offs: (() => void)[] = []; let timer: ReturnType<typeof setTimeout>;
    const addOff = (off: () => void) => cancelled ? off() : offs.push(off);
    void (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      addOff(await listen('open-requested', () => { void callbacks.current.requested(); }));
      addOff(await listen<[number, string[]]>('workspace-changed', event => {
        if (event.payload[0] !== workspaceRef.current?.id) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          setRevision(n => n + 1);
          const active = current.current, ws = workspaceRef.current;
          if (!ws || active === scratch.current || active === guide.current || navigating.current) return;
          // Read after any in-flight write has settled; otherwise a watch notification can return an obsolete version.
          void (async () => {
            if (active.status === 'saving') await active.flush().catch(() => {});
            try {
              const doc = await api.read(ws.id, active.path);
              if (current.current === active) await active.external(doc.contents, doc.version);
            } catch { if (current.current === active) active.missing(); }
          })();
        }, 180);
      }));
      addOff(await listen<string>('menu-action', event => {
        if (event.payload.startsWith('guide:')) { callbacks.current.openGuide(event.payload.slice(6)); return; }
        switch (event.payload) {
          case 'open-file': callbacks.current.choose(false); break;
          case 'open-folder': callbacks.current.choose(true); break;
          case 'new-file': begin({ kind: 'file', path: '' }); break;
          case 'guide': callbacks.current.openGuide(); break;
          case 'shortcuts': setShortcuts(true); break;
          case 'zen': callbacks.current.toggleZen(); break;
          case 'save': void current.current.flush().catch(report); break;
          case 'install-cli': void api.install().then(setNotice).catch(report); break;
          case 'quit': callbacks.current.close(); break;
        }
      }));
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      addOff(await getCurrentWindow().onCloseRequested(event => { event.preventDefault(); callbacks.current.close(); }));
      if (!cancelled) await callbacks.current.requested();
    })().catch(report);
    return () => { cancelled = true; clearTimeout(timer); offs.forEach(off => off()); };
  }, []);

  useEffect(() => {
    // Capture before CodeMirror/Vim/xterm can interpret the reserved Zen shortcut.
    const zenShortcut = (event: KeyboardEvent) => {
      if (!(modifier === '⌘' ? event.metaKey : event.ctrlKey) || event.altKey || event.shiftKey || event.isComposing) return;
      if (event.code !== 'KeyJ' && event.key.toLowerCase() !== 'j') return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (!event.repeat) callbacks.current.toggleZen();
    };
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.code === 'Backquote') { event.preventDefault(); toggleTerminal(); return; }
      if (!(event.metaKey || event.ctrlKey)) return;
      if (['+', '=', '-', '0'].includes(event.key)) {
        event.preventDefault();
        setZoom(value => event.key === '0' ? 1 : Math.max(.7, Math.min(1.6, Math.round((value + (event.key === '-' ? -.1 : .1)) * 10) / 10)));
        return;
      }
      if ((event.target as Element)?.closest('.terminal-panel')) return;
      const key = event.key.toLowerCase();
      if (!['s', 'n', 'o', 'p', 'b', '\\'].includes(key)) return;
      // Dialog inputs own their keystrokes except explicit Save.
      if (document.querySelector('dialog[open]') && key !== 's') return;
      event.preventDefault();
      if (key === 's') void current.current.flush().catch(report);
      if (key === 'n') begin({ kind: 'file', path: '' });
      if (key === 'o') choose(event.shiftKey);
      if (key === 'p') { setQuery(''); setQuick(true); }
      if (key === 'b') setSidebar(value => !value);
      if (key === '\\' && hasPreview(current.current.path)) setMode(value => value === 'split' ? 'source' : 'split');
    };
    const unload = (event: BeforeUnloadEvent) => { if (current.current.dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('keydown', zenShortcut, true);
    window.addEventListener('keydown', handler); window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('keydown', zenShortcut, true); window.removeEventListener('keydown', handler); window.removeEventListener('beforeunload', unload); };
  }, []);

  useEffect(() => {
    if (!quick) return;
    let cancelled = false; setQuickIndex(0);
    const timer = setTimeout(() => {
      if (!workspace) { setResults([]); return; }
      void api.search(workspace.id, query).then(result => { if (!cancelled) { setResults(result.paths); setTruncated(result.truncated); } }).catch(report);
    }, 80);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [quick, query, workspace]);

  function begin(next: FileAction) {
    if (!workspaceRef.current) { setNotice('Open a folder first to create and organize files.'); return; }
    setMenu(null); setAction(next); setActionError('');
    setName(next.kind === 'rename' ? basename(next.path) : next.kind === 'duplicate' ? basename(next.path).replace(/(\.[^.]+)?$/, ' copy$1') : next.kind === 'folder' ? '' : 'Untitled.md');
  }
  async function submitAction(event: SubmitEvent) {
    event.preventDefault(); if (!action || !workspace || navigating.current) return;
    const filename = name.trim();
    if (!filename || filename === '.' || filename === '..' || /[/\\\x00-\x1f]/.test(filename)) { setActionError('Use a name without slashes or control characters.'); return; }
    const parent = ['rename', 'duplicate'].includes(action.kind) ? dirname(action.path) : action.path;
    const path = parent ? `${parent}/${filename}` : filename;
    navigating.current = true; setLocked(true);
    try {
      if (action.kind !== 'copy') await current.current.flush();
      if (action.kind === 'rename') {
        await api.rename(workspace.id, action.path, path);
        if (session.path === action.path || session.path.startsWith(action.path + '/')) await load(workspace, path + session.path.slice(action.path.length));
      } else if (action.kind === 'duplicate') await api.duplicate(workspace.id, action.path, path);
      else {
        await api.create(workspace.id, path, action.kind === 'folder');
        if (action.kind === 'copy') {
          const created = await api.read(workspace.id, path);
          await api.save(workspace.id, path, current.current.text, created.version);
          // A copy is an explicit way to preserve a conflicted buffer before switching.
          current.current.reload(current.current.text, current.current.version);
        }
        if (action.kind !== 'folder') await load(workspace, path);
      }
      setAction(null); setRevision(n => n + 1);
    } catch (error) { setActionError(String(error)); }
    finally { navigating.current = false; setLocked(false); }
  }
  function scrollEditor(line: number, select: boolean) {
    if (!editor.current) return;
    const view = editor.current, from = view.state.doc.line(Math.min(Math.max(line, 1), view.state.doc.lines)).from;
    view.dispatch({ ...(select ? { selection: { anchor: from } } : {}), effects: EditorView.scrollIntoView(from, { y: 'start', yMargin: 28 }) });
    if (select) view.focus();
  }
  function resize(event: PointerEvent, kind: 'sidebar' | 'split') {
    const target = event.currentTarget as HTMLElement; target.setPointerCapture(event.pointerId); document.body.classList.add('resizing');
    const move = (event: PointerEvent) => {
      if (kind === 'sidebar') setSidebarWidth(Math.max(180, Math.min(380, event.clientX)));
      else { const rect = panes.current!.getBoundingClientRect(); setSplit(Math.max(25, Math.min(75, ((event.clientX - rect.left) / rect.width) * 100))); }
    };
    const end = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', end); target.removeEventListener('pointercancel', end); document.body.classList.remove('resizing'); };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', end); target.addEventListener('pointercancel', end);
  }
  function followLink(href: string) {
    if (/^(https?:|mailto:)/i.test(href)) void api.external(href).catch(report);
    else if (workspace) { try { const path = resolveRelative(session.path, href); openFile(path); } catch (error) { report(error); } }
    else setNotice('Open a folder to follow links to other documents.');
  }
  const button = (icon: IconName, title: string, onClick: () => void, active = false) => <button class={`icon-button ${active ? 'active' : ''}`} title={title} aria-label={title} aria-pressed={active} onClick={onClick}><Icon name={icon} /></button>;

  return <div class={`app ${zen ? 'zen' : ''} ${locked ? 'busy' : ''}`}>
    <header class="app-header">
      <div class="brand" style={{ width: sidebar ? sidebarWidth : 168 }}><span class="brand-mark"><Icon name="feather" size={20} /></span><span>feather</span><span class="version">0.1</span></div>
      <div class="header-center"><span class="workspace-dot" /><span>{workspace?.name || 'A quiet place for your thoughts'}</span></div>
      <div class="header-actions">{button('sidebar', `Toggle sidebar (${modifier}B)`, () => setSidebar(!sidebar), sidebar)}<span class="toolbar-separator" />{button(dark ? 'moon' : 'sun', 'Settings', () => setSettings(!settings), settings)}{button('keyboard', 'Keyboard shortcuts', () => setShortcuts(true))}</div>
    </header>
    <div class="app-body">
      {sidebar && <><aside class="sidebar" style={{ width: sidebarWidth }}>
        <div class="sidebar-top"><span class="eyebrow">WORKSPACE</span><button class="icon-button" title="Open folder" aria-label="Open folder" onClick={() => choose(true)}><Icon name="folder" /></button></div>
        <button class="quick-open" onClick={() => { setQuery(''); setQuick(true); }}><Icon name="search" size={14} /><span>Find a file…</span><kbd>{modifier}P</kbd></button>
        {workspace ? <><div class="workspace-label workspace-heading"><button class="workspace-toggle" aria-expanded={!workspaceCollapsed} aria-controls="workspace-files" onClick={() => setWorkspaceCollapsed(!workspaceCollapsed)}><Icon name="chevron" size={11} class={workspaceCollapsed ? '' : 'rotated'} /><span>{workspace.name}</span></button><div class="explorer-actions">{button('new-file', 'New file', () => begin({ kind: 'file', path: '' }))}{button('new-folder', 'New folder', () => begin({ kind: 'folder', path: '' }))}</div></div><Explorer collapsed={workspaceCollapsed} workspace={workspace} active={isLocal ? '' : session.path} revision={revision} onOpen={openFile} onMenu={(entry, x, y) => setMenu({ entry, x, y })} onError={report} /></> : <div class="workspace-empty"><div class="workspace-label"><Icon name="chevron" size={11} class="rotated" /><span>Getting started</span></div><button class={`scratch-row ${isScratch ? 'selected' : ''}`} onClick={() => void transition(async () => attach(scratch.current!))}><span class="file-glyph">M</span>Scratchpad.md</button><p>Your next idea<br />starts with a folder.</p><button class="open-folder-button" onClick={() => choose(true)}><Icon name="folder" size={15} />Open a folder<Icon name="arrow" size={14} /></button><button class="text-button" onClick={() => choose(false)}>or open a file</button></div>}
        <div class="sidebar-bottom">{workspace && <button class="scratch-link" onClick={() => void transition(async () => attach(scratch.current!))}><Icon name="feather" size={14} />Scratchpad</button>}</div>
      </aside><div class="resize-handle sidebar-resize" role="separator" aria-label="Resize sidebar" aria-orientation="vertical" tabIndex={0} aria-valuenow={sidebarWidth} aria-valuemin={180} aria-valuemax={380} onPointerDown={event => resize(event, 'sidebar')} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') setSidebarWidth(n => Math.max(180, Math.min(380, n + (event.key === 'ArrowLeft' ? -10 : 10)))); }} /></>}
      <main class="main">
        <div class="document-toolbar"><div class="document-title">{isGuide && <button class="guide-back" onClick={leaveGuide}>← Back</button>}<span class="file-glyph">{fileGlyph(session.path)}</span><strong>{basename(session.path)}</strong>{isScratch && <span class="scratch-badge">SCRATCHPAD</span>}{isGuide && <span class="scratch-badge">GUIDE</span>}{!isLocal && <span class={`save-state ${status}`} aria-live="polite">{status === 'saved' ? <><Icon name="check" size={12} />Saved</> : status === 'saving' ? 'Saving…' : status === 'modified' ? 'Unsaved' : status === 'conflict' ? 'Changed on disk' : 'Save failed'}</span>}</div>
          <div class="document-actions">{zen && <>{button('focus', 'Exit Zen mode', () => { setZen(false); setSettings(false); }, true)}{button(dark ? 'moon' : 'sun', 'Settings', () => setSettings(!settings), settings)}</>}{button('terminal', 'Toggle terminal (Ctrl+`)', toggleTerminal, terminalVisible)}{canExportPdf(session.path) && <button class="icon-button" title="Export PDF" aria-label="Export PDF" disabled={exporting} onClick={() => void exportPdf()}><Icon name="pdf" /></button>}{button('diff', 'Git diff', () => setMode(mode === 'diff' ? 'split' : 'diff'), mode === 'diff')}<div class="view-switch">{button('file', 'Source view', () => setMode('source'), viewMode === 'source')}{previewable && <>{button('split', 'Split view', () => setMode('split'), mode === 'split')}{button('eye', 'Preview view', () => setMode('preview'), mode === 'preview')}</>}</div></div>
        </div>
        {(error || status === 'error' || status === 'conflict') && <div class="error-banner" role="alert"><span>{error || session.error.replace('CONFLICT: ', '')}</span>{status === 'conflict' && <><button onClick={() => { if (workspace) void api.read(workspace.id, session.path).then(setDisk).catch(report); }}>Review disk</button><button onClick={() => begin({ kind: 'copy', path: dirname(session.path) })}>Save a copy</button></>}{status === 'error' && <button onClick={() => void session.flush().catch(report)}>Retry save</button>}{error && <button class="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><Icon name="close" size={14} /></button>}</div>}
        <div class={`panes mode-${viewMode}`} ref={panes}>
          <section class="source-pane" style={{ width: viewMode === 'split' ? `${split}%` : '100%' }} aria-label="Source editor">
            <div class="pane-label"><span>{(fileLanguage(session.path)?.name || 'Plain text').toUpperCase()}</span><span>{isGuide ? 'Feature guide · read only' : isScratch ? 'Your local scratchpad' : dirname(session.path)}</span></div>
            <Editor session={session} dark={dark} locked={locked || isGuide} vimEnabled={vimEnabled} onView={view => { editor.current = view; connectScrollSync(); }} />
          </section>
          {viewMode === 'split' && <div class="resize-handle split-resize" role="separator" aria-label="Resize editor and preview" aria-orientation="vertical" tabIndex={0} aria-valuenow={split} aria-valuemin={25} aria-valuemax={75} onPointerDown={event => resize(event, 'split')} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') setSplit(n => Math.max(25, Math.min(75, n + (event.key === 'ArrowLeft' ? -2 : 2)))); }} />}
          {mode === 'diff' ? <Suspense fallback={<div class="git-empty">Loading diff…</div>}><GitDiff session={session} workspaceId={isLocal ? undefined : workspace?.id} dark={dark} locked={locked || isGuide} vimEnabled={vimEnabled} onView={view => { diffEditor.current = view; }} /></Suspense> : viewMode !== 'source' && <section class="preview-pane" aria-label="Document preview"><div class="pane-label"><span>{tex ? 'PDF PREVIEW' : 'PREVIEW'}</span><div class="preview-tools"><span class="live-dot" />Live{!tex && button('link', 'Synchronize scrolling', () => setSync(!sync), sync)}</div></div>{tex && workspace ? <TexPreview key={`${workspace.id}-${session.path}`} session={session} workspaceId={workspace.id} /> : <Preview session={session} workspaceId={isLocal ? undefined : workspace?.id} imageRevision={revision} onLink={followLink} onSource={line => { if (mode === 'preview') setMode('split'); scrollEditor(line, true); }} onHandle={handle => { preview.current = handle; connectScrollSync(); if (handle && isGuide && guideLine.current !== null) { const line = guideLine.current; guideLine.current = null; scrollEditor(line, false); handle.scrollToLine(line); } }} />}</section>}
        </div>
        {terminalStarted && workspace && <Suspense fallback={<div class="terminal-loading">Starting Bash…</div>}><TerminalPanel visible={terminalVisible} dark={dark} profile={profile} zoom={zoom} workspaceId={workspace.id} directory={isLocal ? '' : dirname(session.path)} onClose={() => { setTerminalVisible(false); (mode === 'diff' ? diffEditor.current : editor.current)?.focus(); }} /></Suspense>}
      </main>
    </div>
    {settings && <><div class="popover-dismiss" onClick={() => setSettings(false)} /><div class="appearance-popover" role="region" aria-label="Settings"><label class="profile-setting"><span>UI profile</span><select aria-label="UI profile" value={profile} onChange={event => setProfile(event.currentTarget.value)}><option value="feather">Feather</option><option value="github">GitHub</option><option value="midnight">Midnight</option></select></label><div class="theme-options">{(['system', 'light', 'dark'] as const).map(value => <button class={appearance === value ? 'chosen' : ''} aria-pressed={appearance === value} onClick={() => setAppearance(value)}><Icon name={value === 'system' ? 'monitor' : value === 'light' ? 'sun' : 'moon'} size={19} /><span>{value[0].toUpperCase() + value.slice(1)}</span></button>)}</div><div class="zoom-settings"><span>Zoom</span><button aria-label="Zoom out" onClick={() => setZoom(value => Math.max(.7, Math.round((value - .1) * 10) / 10))}>−</button><button aria-label="Reset zoom" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button><button aria-label="Zoom in" onClick={() => setZoom(value => Math.min(1.6, Math.round((value + .1) * 10) / 10))}>+</button></div><div class="editor-settings"><label class="vim-setting"><span>Zen mode<small>Hide the header and sidebar.</small></span><input type="checkbox" role="switch" aria-label="Zen mode" checked={zen} onChange={event => setZen(event.currentTarget.checked)} /></label><label class="vim-setting"><span>Vim mode<small>Navigate with h j k l. Press i to write.<br />Esc returns to Normal mode.</small></span><input type="checkbox" role="switch" aria-label="Vim mode" checked={vimEnabled} onChange={event => setVimEnabled(event.currentTarget.checked)} /></label></div></div></>}
    {menu && <><div class="popover-dismiss" onClick={() => setMenu(null)} /><div class="context-menu" role="menu" style={{ left: Math.min(menu.x, innerWidth - 206), top: Math.min(menu.y, innerHeight - 260) }}>{menu.entry.isDir && <><button role="menuitem" onClick={() => begin({ kind: 'file', path: menu.entry.path })}><Icon name="plus" />New file here</button><button role="menuitem" onClick={() => begin({ kind: 'folder', path: menu.entry.path })}><Icon name="folder" />New folder here</button></>}<button role="menuitem" onClick={() => begin({ kind: 'rename', path: menu.entry.path })}><Icon name="rename" />Rename</button>{!menu.entry.isDir && <button role="menuitem" onClick={() => begin({ kind: 'duplicate', path: menu.entry.path })}><Icon name="copy" />Duplicate</button>}<button role="menuitem" onClick={() => { if (workspace) void api.reveal(workspace.id, menu.entry.path).catch(report); setMenu(null); }}><Icon name="external" />Reveal in file manager</button><hr /><button role="menuitem" class="danger-text" onClick={() => { setDeleteEntry(menu.entry); setMenu(null); }}><Icon name="trash" />Move to trash</button></div></>}
    {action && <Dialog title={{ file: 'A new page', folder: 'A new folder', rename: 'Rename', duplicate: 'Duplicate file', copy: 'Save a copy' }[action.kind]} onClose={() => { if (!locked) setAction(null); }}><form onSubmit={submitAction}><p class="dialog-description">{action.kind === 'copy' ? 'Keep your current text in a new file.' : 'Give it a name. Keep the rest simple.'}</p><label class="input-label" for="filename">{action.kind === 'folder' ? 'Folder name' : 'File name'}</label><input id="filename" class="text-input" autoFocus value={name} onInput={event => setName(event.currentTarget.value)} onFocus={event => event.currentTarget.select()} placeholder={action.kind === 'folder' ? 'research' : 'Untitled.md'} />{actionError && <p class="field-error" role="alert">{actionError}</p>}<div class="dialog-buttons"><button type="button" class="secondary-button" disabled={locked} onClick={() => setAction(null)}>Cancel</button><button class="primary-button" type="submit" disabled={locked}>{locked ? 'Working…' : action.kind === 'rename' ? 'Rename' : action.kind === 'copy' ? 'Save copy' : 'Create'}</button></div></form></Dialog>}
    {deleteEntry && <Dialog title="Move to trash?" onClose={() => setDeleteEntry(null)}><p class="dialog-description">“{deleteEntry.name}”{deleteEntry.isDir ? ' and everything inside it' : ''} will move to your system trash.</p><div class="dialog-buttons"><button class="secondary-button" onClick={() => setDeleteEntry(null)}>Keep it</button><button class="danger-button" disabled={locked} onClick={() => void transition(async () => { if (!workspace) return; await api.trash(workspace.id, deleteEntry.path); if (session.path === deleteEntry.path || session.path.startsWith(deleteEntry.path + '/')) attach(scratch.current!); setDeleteEntry(null); setRevision(n => n + 1); })}>Move to trash</button></div></Dialog>}
    {disk && <Dialog title="This file has two versions" class="conflict-dialog" onClose={() => setDisk(null)}><p class="dialog-description">Your text is preserved. Compare it with the version on disk before choosing what to save.</p><div class="conflict-columns"><div><h3>Your edits</h3><pre>{session.text}</pre></div><div><h3>On disk</h3><pre>{disk.contents}</pre></div></div><div class="dialog-buttons"><button class="secondary-button" onClick={() => { session.reload(disk.contents, disk.version); setDisk(null); setError(''); }}>Use disk version</button><button class="primary-button" onClick={() => { session.version = disk.version; session.status = 'modified'; void session.flush().then(() => { setDisk(null); setError(''); }).catch(report); }}>Save my version</button></div></Dialog>}
    {quick && <Dialog title="Find a file" class="quick-dialog" onClose={() => setQuick(false)}><div class="quick-input"><Icon name="search" size={18} /><input autoFocus aria-label="Find a file" placeholder="Type a file name…" value={query} onInput={event => setQuery(event.currentTarget.value)} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setQuickIndex(n => Math.max(0, Math.min(results.length - 1, n + (event.key === 'ArrowDown' ? 1 : -1)))); } if (event.key === 'Enter' && results[quickIndex]) { openFile(results[quickIndex]); setQuick(false); } }} /><kbd>esc</kbd></div><div class="quick-results" role="listbox" aria-label="Matching files">{results.map((path, index) => <button role="option" aria-selected={quickIndex === index} class={quickIndex === index ? 'highlighted' : ''} onClick={() => { openFile(path); setQuick(false); }}><Icon name="file" /><span>{basename(path)}<small>{dirname(path) || workspace?.name}</small></span><Icon name="arrow" size={14} /></button>)}{!results.length && <p>{workspace ? 'No matching files.' : 'Open a folder to find your documents.'}</p>}</div>{truncated && <p class="quick-hint">Showing the first 200 matches within 50,000 entries. Narrow your search.</p>}</Dialog>}
    {shortcuts && <Dialog title="A few useful shortcuts" onClose={() => setShortcuts(false)}><div class="shortcut-list">{[['New file', `${modifier} N`], ['Open file', `${modifier} O`], ['Open folder', `${modifier} ⇧ O`], ['Save', `${modifier} S`], ['Undo', `${modifier} Z`], ['Redo', `${modifier} ⇧ Z`], ['Toggle Zen mode', `${modifier} J`], ...(modifier === '⌘' ? [['Toggle fullscreen', '⌃ ⌘ F']] : []), ['Find a file', `${modifier} P`], ['Find in document', `${modifier} F`], ['Toggle sidebar', `${modifier} B`], ['Toggle preview', `${modifier} \\`]].map(([label, key]) => <div><span>{label}</span><kbd>{key}</kbd></div>)}</div><p class="shortcut-footnote">Double-click a preview block to jump to its source.<br />Files autosave after 500 ms of quiet.</p></Dialog>}
    {notice && <div class="toast" role="status"><Icon name="check" size={16} /><span>{notice}</span><button class="icon-button" aria-label="Dismiss notification" onClick={() => setNotice('')}><Icon name="close" size={14} /></button></div>}
  </div>;
}
