import { tagHighlighter, tags } from '@lezer/highlight';

// Stable classes let the editor, HTML preview and PDF share the same palette.
export const codeHighlighter = tagHighlighter([
  { tag: [tags.keyword, tags.modifier], class: 'syntax-keyword' },
  { tag: [tags.typeName, tags.className, tags.namespace], class: 'syntax-type' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], class: 'syntax-function' },
  { tag: [tags.string, tags.character], class: 'syntax-string' },
  { tag: [tags.number, tags.bool, tags.null], class: 'syntax-number' },
  { tag: tags.comment, class: 'syntax-comment' },
  { tag: tags.operator, class: 'syntax-operator' },
  { tag: [tags.meta, tags.annotation, tags.processingInstruction], class: 'syntax-meta' },
  { tag: [tags.propertyName, tags.attributeName], class: 'syntax-property' },
  { tag: tags.variableName, class: 'syntax-variable' },
]);
