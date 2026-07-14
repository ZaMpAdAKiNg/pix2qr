export function stripHtmlComments(source) {
  let cursor = 0;
  let output = '';

  while (cursor < source.length) {
    const start = source.indexOf('<!--', cursor);
    if (start === -1) return output + source.slice(cursor);

    const end = source.indexOf('-->', start + 4);
    if (end === -1) {
      throw new Error('[minify] comentário HTML não terminado');
    }

    output += source.slice(cursor, start);
    cursor = end + 3;
  }

  return output;
}
