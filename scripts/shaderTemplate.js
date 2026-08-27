/** Splits a shader into the editable student source and its hidden @prefix/@suffix template. */
export function splitStudentShader(source) {
  const prefixMarker = /^\s*\/\/\s*@prefix\s*$/gm;
  const suffixMarker = /^\s*\/\/\s*@suffix\s*$/gm;
  const prefixMarkers = [...source.matchAll(prefixMarker)];
  const suffixMarkers = [...source.matchAll(suffixMarker)];
  if (![0, 2].includes(prefixMarkers.length) || ![0, 2].includes(suffixMarkers.length)) {
    throw new Error('A starter shader must surround each @prefix or @suffix block with exactly two matching markers.');
  }
  if (prefixMarkers.length === 0 && suffixMarkers.length === 0) return { source, template: undefined };

  const prefixStart = prefixMarkers[0];
  const prefixEnd = prefixMarkers[1];
  const suffixStart = suffixMarkers[0];
  const suffixEnd = suffixMarkers[1];
  const prefixSourceEnd = prefixStart ? (prefixStart.index ?? 0) : 0;
  const studentStart = prefixEnd ? (prefixEnd.index ?? 0) + prefixEnd[0].length : 0;
  const studentEnd = suffixStart ? (suffixStart.index ?? source.length) : source.length;
  const suffixSourceStart = suffixStart ? (suffixStart.index ?? 0) + suffixStart[0].length : source.length;
  const suffixSourceEnd = suffixEnd ? (suffixEnd.index ?? source.length) : source.length;
  if (prefixStart && prefixEnd && (prefixStart.index ?? 0) > (prefixEnd.index ?? 0)) throw new Error('Invalid @prefix block.');
  if (suffixStart && suffixEnd && (suffixStart.index ?? 0) > (suffixEnd.index ?? 0)) throw new Error('Invalid @suffix block.');
  if (studentStart > studentEnd) throw new Error('@prefix must appear before @suffix.');
  if (source.slice(0, prefixStart ? (prefixStart.index ?? 0) : 0).trim()) throw new Error('@prefix must be the first block in a starter shader.');
  if (suffixEnd && source.slice((suffixEnd.index ?? 0) + suffixEnd[0].length).trim()) throw new Error('@suffix must be the final block in a starter shader.');

  return {
    source: source.slice(studentStart, studentEnd).trim(),
    template: {
      prefix: prefixStart && prefixEnd ? source.slice((prefixStart.index ?? 0) + prefixStart[0].length, prefixEnd.index ?? 0).trim() : '',
      suffix: suffixStart && suffixEnd ? source.slice(suffixSourceStart, suffixSourceEnd).trim() : ''
    }
  };
}
