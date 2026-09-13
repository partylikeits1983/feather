import { performance } from 'node:perf_hooks';
import { renderMarkdown } from '../frontend/src/preview/markdown';

const equation = '$$\nf(X) = \\sum_{i=0}^{d} a_i X^i\n$$\n\n';
for (const [label, source] of [
  ['1 KB Markdown', '# Heading\n\nA paragraph with **emphasis**.\n\n'.repeat(25)],
  ['1 MB Markdown (bounded preview)', '# Heading\n\nA paragraph with **emphasis**.\n\n'.repeat(25_000)],
  ['10 equations', equation.repeat(10)],
  ['1,000 equations', equation.repeat(1_000)],
] as const) {
  await renderMarkdown(source);
  const measurements: number[] = [];
  for (let i = 0; i < 5; i++) { const start = performance.now(); await renderMarkdown(source); measurements.push(performance.now() - start); }
  measurements.sort((a, b) => a - b);
  console.log(`${label}: ${measurements[2].toFixed(2)} ms median (5 runs, parsing + HTML only)`);
}
