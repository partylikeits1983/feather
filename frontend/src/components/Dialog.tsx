import { useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { Icon } from './Icon';

export function Dialog({ title, onClose, children, class: className = '' }: { title: string; onClose: () => void; children: ComponentChildren; class?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); return () => ref.current?.close(); }, []);
  return <dialog ref={ref} class={`dialog ${className}`} aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div class="dialog-inner"><div class="dialog-heading"><h2>{title}</h2><button class="icon-button" aria-label="Close dialog" onClick={onClose}><Icon name="close" /></button></div>{children}</div>
  </dialog>;
}
