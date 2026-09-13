import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { fileURLToPath } from 'node:url';
import type { Plugin as PostCssPlugin, AnyNode } from 'postcss';

// PDF.js also ships styles for its standalone sidebar and buttons. Keep all of
// those selectors inside our PDF pane so opening TeX cannot restyle the editor.
const scopePdfStyles: PostCssPlugin = {
  postcssPlugin: 'feather-pdf-scope',
  Once(root) {
    if (!root.source?.input.file?.replaceAll('\\', '/').endsWith('/pdfjs-dist/legacy/web/pdf_viewer.css')) return;
    root.walkRules(rule => {
      // Nested CSS is already scoped by its parent rule; keyframes are not selectors.
      for (let parent: AnyNode | undefined = rule.parent; parent; parent = parent.parent) {
        if (parent.type === 'rule' || (parent.type === 'atrule' && /keyframes$/.test(parent.name))) return;
      }
      rule.selectors = rule.selectors.map(selector => selector.includes(':root') ? selector.replaceAll(':root', '.pdf-preview') : `.pdf-preview ${selector}`);
    });
  },
};

export default defineConfig({
  root: 'frontend', plugins: [preact()], clearScreen: false,
  // The browser export uses document.createElement, which does not exist in a worker.
  resolve: { alias: {
    'decode-named-character-reference': fileURLToPath(new URL('./node_modules/decode-named-character-reference/index.js', import.meta.url)),
    'hast-util-from-html-isomorphic': fileURLToPath(new URL('./node_modules/hast-util-from-html-isomorphic/index.js', import.meta.url)),
  } },
  server: { port: 1420, strictPort: true },
  css: { postcss: { plugins: [scopePdfStyles] } },
  optimizeDeps: { include: ['@codemirror/merge', '@replit/codemirror-vim', '@xterm/xterm', '@xterm/addon-fit', 'pdfjs-dist/legacy/build/pdf.mjs', 'pdfjs-dist/legacy/web/pdf_viewer.mjs'] },
  build: { outDir: '../dist', emptyOutDir: true, target: 'es2022', rollupOptions: { input: { main: fileURLToPath(new URL('./frontend/index.html', import.meta.url)), pdfExport: fileURLToPath(new URL('./frontend/pdf-export.html', import.meta.url)) } } },
  worker: { format: 'es' }
});
