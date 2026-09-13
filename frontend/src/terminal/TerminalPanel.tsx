import { useEffect, useRef, useState } from 'preact/hooks';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { listen } from '@tauri-apps/api/event';
import { api, desktop } from '../api';
import { Icon } from '../components/Icon';
import '@xterm/xterm/css/xterm.css';

export default function TerminalPanel({ visible, dark, profile, workspaceId, directory, onClose, zoom }: { visible: boolean; dark: boolean; profile: string; workspaceId: number; directory: string; onClose: () => void; zoom: number }) {
  const host = useRef<HTMLDivElement>(null), term = useRef<Terminal>(), fit = useRef<FitAddon>(), id = useRef<number>();
  const [error, setError] = useState(''), [cwd, setCwd] = useState(''), [ended, setEnded] = useState(false), [generation, setGeneration] = useState(0);
  const [height, setHeight] = useState(250);
  const theme = () => { const css = getComputedStyle(document.documentElement); return { background: css.getPropertyValue('--editor').trim(), foreground: css.getPropertyValue('--text').trim(), cursor: css.getPropertyValue('--accent').trim(), selectionBackground: css.getPropertyValue('--selection').trim(), black: '#30342d', red: '#c7786b', green: '#8aa570', yellow: '#c4a16b', blue: '#7c9dad', magenta: '#a896b4', cyan: '#79aaa4', white: '#d7dbcf' }; };
  useEffect(() => {
    let disposed = false; const off: (() => void)[] = []; const early: [number, number[]][] = [];
    setEnded(false); setError('');
    const terminal = new Terminal({ fontFamily: "'SFMono-Regular', Consolas, monospace", fontSize: 12, lineHeight: 1.3, cursorBlink: false, scrollback: 3000, theme: theme(), allowProposedApi: false });
    term.current = terminal; const addon = new FitAddon(); fit.current = addon; terminal.loadAddon(addon); terminal.open(host.current!); addon.fit();
    terminal.textarea?.setAttribute('aria-label', 'Bash terminal input');
    terminal.attachCustomKeyEventHandler(event => !(event.ctrlKey && event.code === 'Backquote') && !((event.metaKey || event.ctrlKey) && ['+', '=', '-', '0'].includes(event.key)));
    let writes = Promise.resolve();
    const input = terminal.onData(data => { if (id.current) { const shellId = id.current; writes = writes.then(() => api.terminalWrite(shellId, data)).catch(error => setError(String(error))); } });
    const resize = terminal.onResize(({ cols, rows }) => { if (id.current) void api.terminalResize(id.current, cols, rows).catch(() => {}); });
    const observer = new ResizeObserver(() => { if (host.current?.clientWidth && host.current.clientHeight) addon.fit(); }); observer.observe(host.current!);
    const output = (shellId: number, data: number[]) => terminal.write(new Uint8Array(data), () => { void api.terminalAck(shellId, data.length).catch(() => {}); });
    void (async () => {
      if (!desktop) throw new Error('The Bash terminal is available in the desktop app.');
      const addOff = (fn: () => void) => disposed ? fn() : off.push(fn);
      addOff(await listen<[number, number[]]>('terminal-output', event => {
        const [shellId, data] = event.payload;
        if (id.current === shellId) output(shellId, data); else if (!id.current) early.push(event.payload);
      }));
      addOff(await listen<number>('terminal-exit', event => { if (event.payload === id.current) { setEnded(true); terminal.writeln('\r\n[Shell exited]'); } }));
      const shell = await api.terminalStart(workspaceId, directory, terminal.cols, terminal.rows);
      if (disposed) { await api.terminalStop(shell.id); return; }
      id.current = shell.id; setCwd(shell.cwd); early.filter(([shellId]) => shellId === shell.id).forEach(([shellId, data]) => output(shellId, data)); early.length = 0;
      terminal.focus();
    })().catch(error => { if (!disposed) { setError(String(error)); setEnded(true); } });
    return () => { disposed = true; off.forEach(fn => fn()); input.dispose(); resize.dispose(); observer.disconnect(); terminal.dispose(); if (id.current) void api.terminalStop(id.current).catch(() => {}); id.current = undefined; };
  }, [generation]);
  useEffect(() => { if (term.current) term.current.options.theme = theme(); }, [dark, profile]);
  useEffect(() => { if (visible) { requestAnimationFrame(() => { fit.current?.fit(); term.current?.focus(); }); } }, [visible, zoom]);
  function resizePanel(event: PointerEvent) {
    const target = event.currentTarget as HTMLElement; target.setPointerCapture(event.pointerId); const start = event.clientY, original = height;
    const move = (event: PointerEvent) => setHeight(Math.max(130, Math.min(innerHeight * .65, original + start - event.clientY)));
    const end = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', end); target.removeEventListener('pointercancel', end); };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', end); target.addEventListener('pointercancel', end);
  }
  return <section class="terminal-panel" aria-label="Bash terminal" style={{ height, display: visible ? 'flex' : 'none' }}>
    <div class="terminal-resize" role="separator" aria-label="Resize terminal" aria-orientation="horizontal" onPointerDown={resizePanel} />
    <div class="terminal-toolbar"><span>BASH</span><span class="terminal-cwd" title={cwd}>{cwd}</span><div>{ended ? <button title="Start Bash" aria-label="Start Bash" class="icon-button" onClick={() => setGeneration(n => n + 1)}><Icon name="refresh" size={14} /></button> : <button title="Stop shell" aria-label="Stop shell" class="icon-button" onClick={() => { if (id.current) void api.terminalStop(id.current).then(() => setEnded(true)).catch(error => setError(String(error))); }}><Icon name="trash" size={14} /></button>}<button class="icon-button" title="Hide terminal (Ctrl+`)" aria-label="Hide terminal" onClick={onClose}><Icon name="close" size={14} /></button></div></div>
    {error && <div class="terminal-error" role="alert">{error}</div>}<div class="terminal-host" ref={host} />
  </section>;
}
