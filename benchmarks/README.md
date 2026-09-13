# Measuring Feather

Targets are in the main README. Report the machine, OS, release/debug mode and fixture with every measurement.

- `cargo bench -p feather-core --bench filesystem`: 1 KB / 1 MB reads and a 10,000-file directory, using temporary fixtures.
- `npm run bench:preview`: warmed Markdown/KaTeX parsing and HTML generation. Includes 1 MB source and 1,000 equations; preview bounds apply. This measures worker computation, not DOM insertion or perceived latency.
- `npm run test:ui`: real browser edit/render workflows. Screenshots go to `artifacts/`.
- Startup: build a release app, quit all Feather processes, launch the installed CLI against a known fixture and measure from process creation until the editor accepts input. Repeat for cold and warm filesystem caches. Do not use a second-instance focus time as a cold launch measurement.

The current preview cap is 180,000 characters. Source is fully editable up to 32 MB. A single editor change currently materializes the CodeMirror document string, so the <16 ms typing target must still be measured on large documents. Targets are not guarantees.
