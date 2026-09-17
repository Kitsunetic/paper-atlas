const NAMED_ENTITIES = new Map([
  ['amp', '&'], ['apos', "'"], ['gt', '>'], ['lt', '<'], ['nbsp', ' '], ['quot', '"']
]);

function splitAffiliationList(value) {
  const pieces = [];
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== ';') continue;
    const ampersand = value.lastIndexOf('&', index);
    const entity = ampersand >= start && /^&(?:#x[0-9a-f]+|#\d+|[a-z]+);$/iu.test(value.slice(ampersand, index + 1));
    if (entity) continue;
    pieces.push(value.slice(start, index));
    start = index + 1;
  }
  pieces.push(value.slice(start));
  return pieces;
}

function decodeHtmlEntities(value) {
  return String(value).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (match, token) => {
    const lower = token.toLowerCase();
    if (lower.startsWith('#x')) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
    if (lower.startsWith('#')) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
    return NAMED_ENTITIES.get(lower) ?? match;
  });
}

/** A non-destructive comparison key: raw source strings remain separately stored. */
export function comparisonKey(raw) {
  return decodeHtmlEntities(raw)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en-US')
    .replace(/&/gu, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
}

/** Split only explicit semicolon lists; punctuation within an institution is retained. */
export function segmentAffiliation(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return [];
  const pieces = splitAffiliationList(value).map((piece) => piece.trim()).filter(Boolean);
  const method = pieces.length > 1 ? 'semicolon' : 'whole_raw';
  return pieces.map((piece, index) => ({ index, method, raw: piece }));
}
