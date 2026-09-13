export type IconName = 'feather' | 'folder' | 'file' | 'chevron' | 'plus' | 'search' | 'sidebar' | 'split' | 'eye' | 'sun' | 'moon' | 'monitor' | 'arrow' | 'more' | 'close' | 'check' | 'link' | 'rename' | 'copy' | 'trash' | 'external' | 'keyboard' | 'new-file' | 'new-folder' | 'diff' | 'refresh' | 'terminal' | 'pdf' | 'focus';
const paths: Record<IconName, string> = {
  'new-file': 'M14 3H5v18h7M14 3v6h5l-5-6ZM19 13v8m-4-4h8',
  'new-folder': 'M3 7V5h6l2 3h10v4M3 7v13h9M18 14v8m-4-4h8',
  diff: 'M8 3v18M16 3v18M3 7h10M13 17h8M5 12h6',
  refresh: 'M20 7V2m0 5h-5M4 17v5m0-5h5M20 7a9 9 0 0 0-16 3m0 7a9 9 0 0 0 16-3',
  terminal: 'M3 4h18v16H3V4Zm4 4 4 4-4 4m6 0h4',
  pdf: 'M14 3H5v18h14V8l-5-5Zm0 0v6h5M12 11v7m-3-3 3 3 3-3',
  focus: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
  feather: 'M19.5 3.8c-3-1.6-7.3.2-10.3 4.6S5.4 17 6.4 18.3c2.4.4 5.8-1.2 8.7-5.2s5.8-7.7 4.4-9.3ZM4 21 15 7M7 16l5 .2M10 12l4 .2',
  folder: 'M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11H3V7Z',
  file: 'M14 3H5v18h14V8l-5-5Zm0 0v6h5M8 13h8M8 17h6',
  chevron: 'm9 5 7 7-7 7', plus: 'M12 5v14M5 12h14', search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  sidebar: 'M3 4h18v16H3V4Zm5 0v16', split: 'M3 4h18v16H3V4Zm9 0v16',
  eye: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  sun: 'M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  moon: 'M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z', monitor: 'M3 3h18v13H3V3Zm9 13v5M8 21h8',
  arrow: 'M4 12h15m-5-5 5 5-5 5', more: 'M5 12h.01M12 12h.01M19 12h.01', close: 'm6 6 12 12M6 18 18 6',
  check: 'm5 12 4 4L19 6', link: 'm10 13 4-4M8 15l-2 2a4 4 0 0 1-5-5l5-5a4 4 0 0 1 5 0m2 2 2-2a4 4 0 0 1 5 5l-5 5a4 4 0 0 1-5 0',
  rename: 'm14 5 5 5M4 20l5-1L21 7l-5-5L4 14v6Z', copy: 'M8 8h13v13H8V8ZM16 8V3H3v13h5', trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  external: 'M14 3h7v7M21 3 10 14M10 3H3v18h18v-7', keyboard: 'M2 5h20v14H2V5ZM5 9h1m3 0h1m3 0h1m3 0h1M5 13h1m3 0h1m3 0h1m3 0h1M7 16h10',
};
export function Icon({ name, size = 16, class: className = '' }: { name: IconName; size?: number; class?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class={className} aria-hidden="true"><path d={paths[name]} /></svg>;
}
