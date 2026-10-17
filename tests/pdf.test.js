import test from 'node:test';
import assert from 'node:assert/strict';
import { countText, pageText } from '../js/pdf-counts.js';
test('Korean, combining characters, emoji, punctuation and whitespace', () => {
 assert.deepEqual(countText('한글 A\t1!\n👨‍👩‍👧‍👦'), {withSpaces:8, withoutSpaces:6});
 assert.deepEqual(countText('가 e\u0301\r\n'), {withSpaces:3,withoutSpaces:2});
});
test('PDF line endings do not invent spaces between text runs', () => {
 const text=pageText([{str:'안녕',hasEOL:false},{str:' 세상',hasEOL:true},{str:'!'}]);
 assert.equal(text,'안녕 세상\n!');
 assert.deepEqual(countText(text),{withSpaces:6,withoutSpaces:5});
});
