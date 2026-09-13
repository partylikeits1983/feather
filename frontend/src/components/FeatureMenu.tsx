import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './Icon';

const topics = ['Markdown and math', 'LaTeX and PDF', 'Saving and exporting', 'Files and workspace', 'Editing and Vim', 'Git diff and terminal', 'Appearance and shortcuts'];

export function FeatureMenu({ zen, onOpen, onShortcuts }: { zen: boolean; onOpen: (section?: string) => void; onShortcuts: () => void }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  useEffect(() => { setOpen(false); }, [zen]);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const dismiss = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  function select(action: () => void) { setOpen(false); trigger.current?.focus(); action(); }
  return <div class="feature-menu" ref={container}>
    <button class="feature-trigger" ref={trigger} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } }}>Features<Icon name="chevron" size={10} class="rotated" /></button>
    {open && <div class="feature-dropdown" role="menu" aria-label="Feather features" ref={menu} onKeyDown={event => {
      const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button') || []);
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
      if (event.key === 'Tab') setOpen(false);
    }}>
      <button role="menuitem" onClick={() => select(() => onOpen())}><Icon name="file" size={14} />Feature guide</button>
      <hr />
      {topics.map(topic => <button role="menuitem" key={topic} onClick={() => select(() => onOpen(topic))}>{topic}</button>)}
      <hr />
      <button role="menuitem" onClick={() => select(onShortcuts)}><Icon name="keyboard" size={14} />Keyboard shortcuts</button>
    </div>}
  </div>;
}
