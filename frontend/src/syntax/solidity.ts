import { StreamLanguage, type StreamParser } from '@codemirror/language';

const keywords = new Set(('pragma solidity import from as contract abstract interface library is using for struct enum function constructor modifier event error ' +
  'mapping public private internal external pure view payable virtual override constant immutable memory storage calldata indexed anonymous returns return ' +
  'if else while do for break continue try catch throw revert require assert emit new delete unchecked assembly let switch case default leave ' +
  'receive fallback global transient').split(' '));
interface State { comment: boolean; quote: string }
const parser: StreamParser<State> = {
  name: 'solidity',
  startState: () => ({ comment: false, quote: '' }),
  copyState: state => ({ ...state }),
  languageData: { commentTokens: { line: '//', block: { open: '/*', close: '*/' } } },
  token(stream, state) {
    if (state.comment || stream.match('/*')) {
      state.comment = true;
      while (!stream.eol()) { if (stream.match('*/')) { state.comment = false; break; } stream.next(); }
      return 'comment';
    }
    if (state.quote || stream.match(/(?:unicode|hex)?["']/)) {
      state.quote ||= stream.current().slice(-1);
      while (!stream.eol()) { const ch = stream.next(); if (ch === '\\') stream.next(); else if (ch === state.quote) { state.quote = ''; break; } }
      return 'string';
    }
    if (stream.eatSpace()) return null;
    if (stream.match('//')) { stream.skipToEnd(); return 'comment'; }
    if (stream.match(/(?:0[xX][\da-fA-F_]+|\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?[\d_]+)?)/)) return 'number';
    if (stream.match(/[a-zA-Z_$][\w$]*/)) {
      const word = stream.current();
      if (keywords.has(word)) return 'keyword';
      if (/^(?:u?int(?:\d+)?|bytes(?:\d+)?|address|bool|string|u?fixed(?:\d+x\d+)?)$/.test(word)) return 'typeName';
      if (word === 'true' || word === 'false') return 'bool';
      if (/^(?:msg|block|tx|abi|this|super|wei|gwei|ether|seconds|minutes|hours|days|weeks)$/.test(word)) return 'builtin';
      return 'variableName';
    }
    if (stream.match(/[+\-*/%=!<>&|^~?:]+/)) return 'operator';
    stream.next(); return 'punctuation';
  },
};
export const solidityLanguage = StreamLanguage.define(parser);
