import { StreamLanguage, type StreamParser, type StringStream } from '@codemirror/language';
import { tags } from '@lezer/highlight';

// Lexical Lean 4 colouring, including Unicode identifiers and nested comments.
// This intentionally works without a Lean process or a project environment.
interface State { commentDepth: number; string: boolean; definition: boolean }
const keywords = new Set(('import prelude namespace section end open export universe universes variable variables ' +
  'def theorem lemma example abbrev opaque axiom axioms constant constants inductive coinductive structure class instance ' +
  'extends deriving where with mutual private protected public noncomputable partial unsafe local scoped ' +
  'attribute set_option syntax macro macro_rules elab elab_rules notation infix infixl infixr prefix postfix ' +
  'by fun forall let have show from suffices if then else match do return for in while try catch finally ' +
  'calc at as of sorry admit termination_by decreasing_by nonrec').split(' '));
const declarations = new Set(['def', 'theorem', 'lemma', 'abbrev', 'opaque', 'axiom', 'constant', 'inductive', 'structure', 'class']);
const tactics = new Set(('exact apply intro intros rfl simp simpa dsimp rw rfl decide trivial assumption constructor ' +
  'cases induction obtain refine change unfold revert subst congr ext omega ring linarith norm_num aesop done ' +
  'first next case all_goals any_goals repeat fail_if_success').split(' '));
const types = new Set(['Prop', 'Type', 'Sort', 'Nat', 'Int', 'Rat', 'Real', 'Bool', 'Char', 'String', 'List', 'Array', 'Option', 'Unit', 'IO', 'Fin', 'Float', 'UInt8', 'UInt32', 'UInt64']);

function blockComment(stream: StringStream, state: State) {
  while (!stream.eol()) {
    if (stream.match('/-')) state.commentDepth++;
    else if (stream.match('-/')) { if (--state.commentDepth === 0) break; }
    else stream.next();
  }
  return 'comment';
}

function stringLiteral(stream: StringStream, state: State) {
  while (!stream.eol()) {
    const character = stream.next();
    if (character === '\\') stream.next();
    else if (character === '"') { state.string = false; break; }
  }
  return 'string';
}

export const leanParser: StreamParser<State> = {
  name: 'lean',
  startState: () => ({ commentDepth: 0, string: false, definition: false }),
  copyState: state => ({ ...state }),
  languageData: { commentTokens: { line: '--', block: { open: '/-', close: '-/' } } },
  tokenTable: { functionName: tags.function(tags.variableName), definitionName: tags.function(tags.definition(tags.variableName)) },
  token(stream, state) {
    if (state.commentDepth) return blockComment(stream, state);
    if (state.string) return stringLiteral(stream, state);
    if (stream.eatSpace()) return null;
    if (stream.match('--')) { stream.skipToEnd(); return 'comment'; }
    if (stream.match('/-')) { state.commentDepth = 1; return blockComment(stream, state); }
    if (stream.match('"')) { state.string = true; return stringLiteral(stream, state); }
    if (stream.match(/'(?:\\(?:u\{[\da-fA-F]+\}|x[\da-fA-F]{2}|.)|[^'\\])'/u)) return 'character';
    if (stream.match(/#[\p{L}_][\p{L}\p{N}_]*/u)) return 'meta';
    if (stream.match(/(?:0[xX][\da-fA-F]+|0[bB][01]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/)) return 'number';
    if (stream.match(/«[^»]*»/u) || stream.match(/[\p{L}_][\p{L}\p{N}\p{M}_'!?]*(?:\.[\p{L}_][\p{L}\p{N}\p{M}_'!?]*)*/u)) {
      const word = stream.current();
      if (keywords.has(word)) { state.definition = declarations.has(word); return 'keyword'; }
      if (state.definition) { state.definition = false; return 'definitionName'; }
      if (types.has(word)) return 'typeName';
      if (word === 'true' || word === 'false') return 'bool';
      if (tactics.has(word)) return 'functionName';
      return 'variableName';
    }
    state.definition = false;
    if (stream.match(/[()[\]{},;]/)) return 'punctuation';
    if (stream.match(/[+\-*/=<>:|&!@^~?.\\%$←→↔⇒↦∀∃λ∧∨¬≤≥≠∈∉∪∩∘⊢]+/u)) return 'operator';
    stream.next();
    return null;
  },
};

export const leanLanguage = StreamLanguage.define(leanParser);
