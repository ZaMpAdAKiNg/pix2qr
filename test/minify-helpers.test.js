const test = require('node:test');
const assert = require('node:assert/strict');

let stripHtmlComments;

test.before(async () => {
  ({ stripHtmlComments } = await import('../scripts/minify-helpers.mjs'));
});

test('remove comentários HTML simples e adjacentes', () => {
  assert.equal(
    stripHtmlComments('antes<!-- um --><!-- dois -->depois'),
    'antesdepois',
  );
});

test('um marcador de abertura dentro do comentário não sobra no resultado', () => {
  assert.equal(
    stripHtmlComments('antes<!-- externo <!-- interno -->depois'),
    'antesdepois',
  );
});

test('preserva a entrada sem comentários e rejeita comentário truncado', () => {
  assert.equal(stripHtmlComments('<main>ok</main>'), '<main>ok</main>');
  assert.throws(
    () => stripHtmlComments('<main><!-- truncado</main>'),
    /comentário HTML não terminado/,
  );
});
