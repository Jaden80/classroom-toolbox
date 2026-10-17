const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });
export function countText(text) {
  const flat = text.normalize('NFC').replace(/[\r\n\u2028\u2029]/gu, '');
  const length = value => { let n = 0; for (const _ of segmenter.segment(value)) n++; return n; };
  return { withSpaces: length(flat), withoutSpaces: length(flat.replace(/\s/gu, '')) };
}
export function pageText(items) {
  return items.filter(item => typeof item.str === 'string').map(item => item.str + (item.hasEOL ? '\n' : '')).join('');
}
