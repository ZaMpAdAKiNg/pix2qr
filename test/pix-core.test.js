// Testes do núcleo PIX. Todas as fixtures são sintéticas e usam domínios
// reservados; nunca adicione chaves, payloads ou cobranças reais neste arquivo.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const corePath = process.env.PIX_CORE_PATH
  ? path.resolve(process.env.PIX_CORE_PATH)
  : path.resolve(__dirname, '../pix-core.js');
const C = require(corePath);

const SYNTHETIC_EMAIL = 'fixture@example.com';
const SYNTHETIC_UUID = '00000000-0000-4000-8000-000000000000';
const SYNTHETIC_PHONE = '+5500999990000'; // DDD 00: deliberadamente não roteável
const OFFICIAL_EVP_NON_V4 = '123e4567-e12b-12d1-a456-426655440000';
const OFFICIAL_BCB_STATIC = '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D';
const OFFICIAL_BCB_COMPOSITE_RECURRENCE_ONLY = '00020126180014br.gov.bcb.pix5204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***80740014br.gov.bcb.pix2552pix.example.com/rec/2353c790eefb11eaadc10242ac1200026304F2DA';
const OFFICIAL_BCB_COMPOSITE_STATIC = '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865406100.505802BR5913Fulano de Tal6008BRASILIA62070503***80740014br.gov.bcb.pix2552pix.example.com/rec/2353c790eefb11eaadc10242ac12000263042875';
const OFFICIAL_BCB_COMPOSITE_DYNAMIC = '00020101021226700014br.gov.bcb.pix2548pix.example.com/8b3da2f39a4140d1a91abd93113bd4415204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***80740014br.gov.bcb.pix2552pix.example.com/rec/2353c790eefb11eaadc10242ac1200026304FB42';

function finish(body) {
  const withCrcHeader = `${body}6304`;
  return withCrcHeader + C.crc16(withCrcHeader);
}

function rawTlv(id, value) {
  const length = new TextEncoder().encode(value).length.toString().padStart(2, '0');
  return `${id}${length}${value}`;
}

function makeStatic({
  key = SYNTHETIC_EMAIL,
  amount = '',
  gui = 'br.gov.bcb.pix',
  currency = '986',
  country = 'BR',
  name = 'LOJA TESTE',
  city = 'BRASILIA',
  txid = 'FIXTURE1',
  poi,
  merchantExtra = '',
  mcc = '0000',
  postal = '',
  additionalExtra = '',
  merchantId = 26,
} = {}) {
  const merchant = C.tlv(0, gui) + C.tlv(1, key) + merchantExtra;
  const additional = C.tlv(5, txid) + additionalExtra;
  const body = C.tlv(0, '01')
    + (poi ? C.tlv(1, poi) : '')
    + C.tlv(merchantId, merchant)
    + C.tlv(52, mcc)
    + C.tlv(53, currency)
    + (amount ? C.tlv(54, amount) : '')
    + C.tlv(58, country)
    + C.tlv(59, name)
    + C.tlv(60, city)
    + (postal ? C.tlv(61, postal) : '')
    + C.tlv(62, additional);
  return finish(body);
}

function makeDynamic({
  location = 'pix.example.invalid/cobv/synthetic-token',
  amount = '',
  poi = '12',
  gui = 'br.gov.bcb.pix',
  name = 'LOJA TESTE',
  city = 'BRASILIA',
  txid = '***',
} = {}) {
  const merchant = C.tlv(0, gui) + C.tlv(25, location);
  const body = C.tlv(0, '01')
    + (poi ? C.tlv(1, poi) : '')
    + C.tlv(26, merchant)
    + C.tlv(52, '0000')
    + C.tlv(53, '986')
    + (amount ? C.tlv(54, amount) : '')
    + C.tlv(58, 'BR')
    + C.tlv(59, name)
    + C.tlv(60, city)
    + C.tlv(62, C.tlv(5, txid));
  return finish(body);
}

function makePaddedStatic(targetBytes) {
  const original = makeStatic();
  const entries = C.parseTLVStrict(original, true).entries;
  const originalBytes = new TextEncoder().encode(original).length;
  let remaining = targetBytes - originalBytes;
  const extensions = [];
  let id = 2;
  while (remaining > 0) {
    let fieldBytes = Math.min(103, remaining); // header TLV (4) + até 99 bytes
    const tail = remaining - fieldBytes;
    if (tail > 0 && tail < 5) fieldBytes -= 5 - tail;
    assert.ok(fieldBytes >= 5 && fieldBytes <= 103);
    const valueBytes = fieldBytes - 4;
    // Extensão sintética desconhecida e multibyte: prova que o cap mede UTF-8,
    // não code units JavaScript.
    const value = valueBytes >= 2 ? `é${'x'.repeat(valueBytes - 2)}` : 'x';
    extensions.push(C.tlv(id++, value));
    remaining -= fieldBytes;
  }
  assert.ok(id <= 26, 'há IDs de extensão suficientes antes do MAI 26');
  const body = entries[0].raw + extensions.join('') + entries.slice(1).map((entry) => entry.raw).join('');
  const payload = finish(body);
  assert.equal(new TextEncoder().encode(payload).length, targetBytes);
  return payload;
}

function cpfFromBase(base) {
  const digits = base.split('').map(Number);
  const check = (count, weight) => {
    let sum = 0;
    for (let i = 0; i < count; i++) sum += digits[i] * (weight - i);
    let value = (sum * 10) % 11;
    if (value >= 10) value = 0;
    digits.push(value);
  };
  check(9, 10);
  check(10, 11);
  return digits.join('');
}

function cnpjFromBase(base) {
  const chars = base.toUpperCase().split('');
  const values = chars.map((char) => char.charCodeAt(0) - 48);
  const append = (weights) => {
    const sum = weights.reduce((total, weight, index) => total + values[index] * weight, 0);
    const remainder = sum % 11;
    const digit = remainder < 2 ? 0 : 11 - remainder;
    chars.push(String(digit));
    values.push(digit);
  };
  append([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  append([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return chars.join('');
}

test('crc16 usa o vetor independente CRC-CCITT-FALSE', () => {
  assert.equal(C.crc16('123456789'), '29B1');
});

test('vetor oficial BCB estático prova CRC 1D3D e EVP não-v4', () => {
  assert.equal(C.crc16(OFFICIAL_BCB_STATIC.slice(0, -4)), '1D3D');
  assert.equal(C.validaCopiaCola(OFFICIAL_BCB_STATIC), true);
  const parsed = C.parseCopiaCola(OFFICIAL_BCB_STATIC);
  assert.equal(parsed.chave, OFFICIAL_EVP_NON_V4);
  assert.equal(parsed.paymentType, 'static');
  assert.equal(C.parseChave(OFFICIAL_EVP_NON_V4).tipo, 'aleatoria');
});

test('payload estático sintético é válido e adulteração quebra o CRC', () => {
  const payload = makeStatic({ amount: '123.45' });
  assert.equal(C.validaCopiaCola(payload), true);
  assert.equal(C.validaCopiaCola(payload.replace('123.45', '999.45')), false);
});

test('parseCopiaCola extrai campos sintéticos estáticos', () => {
  const parsed = C.parseCopiaCola(makeStatic({ amount: '123.45' }));
  assert.deepEqual(parsed, {
    isDinamico: false,
    isComposto: false,
    paymentType: 'static',
    chave: SYNTHETIC_EMAIL,
    location: '',
    recurrenceLocation: '',
    valor: '123.45',
    moeda: '986',
    nome: 'LOJA TESTE',
    cidade: 'BRASILIA',
    pais: 'BR',
    txid: 'FIXTURE1',
    merchantAccountId: '26',
    recurrenceTemplateId: '',
  });
});

test('QR dinâmico sintético aceita ausência de valor e POI opcional', () => {
  for (const poi of ['12', null]) {
    const parsed = C.parseCopiaCola(makeDynamic({ poi }));
    assert.equal(parsed.isDinamico, true);
    assert.equal(parsed.valor, '');
    assert.equal(parsed.location, 'pix.example.invalid/cobv/synthetic-token');
  }
});

test('QR dinâmico pode carregar valor canônico, mas continua dinâmico', () => {
  const parsed = C.parseCopiaCola(makeDynamic({ amount: '1.00' }));
  assert.equal(parsed.isDinamico, true);
  assert.equal(parsed.valor, '1.00');
});

test('location PIX exige FQDN HTTPS público e caminho canônico', () => {
  for (const location of [
    // O vetor oficial dinâmico tem apenas urlAccessToken; recorrência inclui
    // pixEndpoint/urlAccessToken. Ambos são layouts BCB válidos.
    'pix.example.com/synthetic-token',
    'pix.example.com/cobv/synthetic-token',
    'PIX.EXAMPLE.COM/rec/a-b_c~d',
    'xn--exemplo-3ya.example/rec/token',
    'pix.example.com/rec/synthetic%2Dtoken',
  ]) {
    const url = C.pixLocationUrl(location);
    assert.ok(url, location);
    assert.equal(url.protocol, 'https:');
  }

  for (const location of [
    'localhost/cobv/token',
    'api.localhost/cobv/token',
    '127.0.0.1/cobv/token',
    '2130706433/cobv/token',
    '[::1]/cobv/token',
    'singlelabel/cobv/token',
    'pix_example.com/cobv/token',
    '-pix.example.com/cobv/token',
    'pix-.example.com/cobv/token',
    'pix.example.com:443/cobv/token',
    'pix.example.com:444/cobv/token',
    'user@pix.example.com/cobv/token',
    'user:secret@pix.example.com/cobv/token',
    'pix.example.com',
    'pix.example.com/',
    'pix.example.com/rec/',
    'pix.example.com//token',
    'pix.example.com/rec//token',
    'pix.example.com/cobv/token?status=open',
    'pix.example.com/cobv/token#fragment',
    'pix.example.com/a/../cobv/token',
    'pix.example.com/a/./cobv/token',
    'pix.example.com/a/%2e%2e/cobv/token',
    'pix.example.com/a/.%2E/cobv/token',
    'pix.example.com/a/%252e%252e/cobv/token',
    'pix.example.com/a/%25252e%25252e/cobv/token',
    'pix.example.com/a/%2e%2e%2fcobv/token',
    'pix.example.com/a\\..\\cobv/token',
    'pix.example.com/rec/token%2Fchild',
    'pix.example.com/rec/token%252Fchild',
    'pix.example.com/rec/token%5Cchild',
    'pix.example.com/rec/token%255Cchild',
    'pix.example.com/rec/token%00',
    'pix.example.com/rec/token%0A',
    'pix.example.com/rec/token%20with-space',
    'pix.example.com/rec/token^caret',
    'pix.example.com/rec/[token]',
    'pix.example.com/cobv/%GG',
  ]) {
    assert.equal(C.pixLocationUrl(location), null, location);
    assert.equal(C.validaCopiaCola(makeDynamic({ location })), false, location);
  }
});

test('limite total do BR Code é 1024 bytes UTF-8, não code units', () => {
  const atLimit = makePaddedStatic(1024);
  const overLimit = makePaddedStatic(1025);
  assert.ok(atLimit.length < 1024, 'extensões multibyte reduzem code units aparentes');
  assert.ok(overLimit.length < 1024, '1025 bytes ainda passam no cap antigo por code units');
  assert.equal(C.validaCopiaCola(atLimit), true);
  assert.equal(C.validaCopiaCola(overLimit), false);
});

test('GUI Pix é encontrado em qualquer Merchant Account Information 26..51', () => {
  const parsed = C.parseCopiaCola(makeStatic({ merchantId: 51 }));
  assert.equal(parsed.merchantAccountId, '51');
  assert.equal(parsed.chave, SYNTHETIC_EMAIL);
});

test('três cenários oficiais de Pix Automático são modelados sem buscar URLs', () => {
  const cases = [
    [OFFICIAL_BCB_COMPOSITE_RECURRENCE_ONLY, 'F2DA', 'none'],
    [OFFICIAL_BCB_COMPOSITE_STATIC, '2875', 'static'],
    [OFFICIAL_BCB_COMPOSITE_DYNAMIC, 'FB42', 'dynamic'],
  ];
  for (const [payload, crc, paymentType] of cases) {
    assert.equal(C.crc16(payload.slice(0, -4)), crc);
    const parsed = C.parseCopiaCola(payload);
    assert.equal(parsed.isComposto, true);
    assert.equal(parsed.paymentType, paymentType);
    assert.equal(parsed.recurrenceTemplateId, '80');
    assert.equal(parsed.recurrenceLocation, 'pix.example.com/rec/2353c790eefb11eaadc10242ac120002');
  }
  assert.equal(C.parseCopiaCola(OFFICIAL_BCB_COMPOSITE_RECURRENCE_ONLY).isDinamico, false);
  assert.equal(C.parseCopiaCola(OFFICIAL_BCB_COMPOSITE_DYNAMIC).isDinamico, true);
});

test('Pix Automático exige GUI/URL de recorrência válidas e mesmo FQDN no dinâmico', () => {
  const dynamic = C.parseTLVStrict(OFFICIAL_BCB_COMPOSITE_DYNAMIC, true).entries;
  const mismatched = dynamic.map((entry) => entry.id === '80'
    ? C.tlv(80, C.tlv(0, 'br.gov.bcb.pix') + C.tlv(25, 'other.example/rec/synthetic'))
    : entry.raw).join('');
  assert.equal(C.validaCopiaCola(finish(mismatched)), false);

  const missingLocation = dynamic.map((entry) => entry.id === '80'
    ? C.tlv(80, C.tlv(0, 'br.gov.bcb.pix'))
    : entry.raw).join('');
  assert.equal(C.validaCopiaCola(finish(missingLocation)), false);
});

test('parser TLV rejeita truncamento e nunca devolve mapa parcial', () => {
  assert.deepEqual(C.parseTLV('0002015204000'), {});
  const malformed = finish(C.tlv(0, '01') + '9905abc');
  assert.equal(C.validaCopiaCola(malformed), false);
  assert.equal(C.parseCopiaCola(malformed), null);
});

test('parser TLV rejeita IDs duplicados no topo e em templates', () => {
  const valid = makeStatic({ amount: '1.00' });
  const info = C.parseTLVStrict(valid, true);
  const duplicateAmount = finish(info.entries.map((entry) => entry.raw).join('') + C.tlv(54, '2.00'));
  assert.equal(C.validaCopiaCola(duplicateAmount), false);

  const duplicatedMerchant = C.tlv(0, 'br.gov.bcb.pix')
    + C.tlv(1, SYNTHETIC_EMAIL)
    + C.tlv(1, 'other@example.com');
  const body = C.tlv(0, '01') + C.tlv(26, duplicatedMerchant)
    + C.tlv(52, '0000') + C.tlv(53, '986') + C.tlv(58, 'BR')
    + C.tlv(59, 'LOJA') + C.tlv(60, 'BRASILIA') + C.tlv(62, C.tlv(5, '***'));
  assert.equal(C.validaCopiaCola(finish(body)), false);
});

test('validação semântica exige GUI PIX, BRL e país BR', () => {
  assert.equal(C.validaCopiaCola(makeStatic({ gui: 'example.invalid' })), false);
  assert.equal(C.validaCopiaCola(makeStatic({ currency: '840' })), false);
  assert.equal(C.validaCopiaCola(makeStatic({ country: 'US' })), false);
});

test('validação semântica rejeita montante não canônico', () => {
  for (const amount of ['1e2', '1.2.3', '0.00', '-1.00']) {
    assert.equal(C.validaCopiaCola(makeStatic({ amount })), false, amount);
  }
});

test('validação semântica rejeita combinações contraditórias de modo', () => {
  assert.equal(C.validaCopiaCola(makeStatic({ poi: '12' })), false);
  assert.equal(C.validaCopiaCola(makeDynamic({ poi: '11' })), false);
});

test('validação semântica rejeita campos obrigatórios ausentes', () => {
  const base = C.parseTLVStrict(makeStatic(), true).entries;
  for (const missing of ['26', '52', '53', '58', '59', '60', '62']) {
    const body = base.filter((entry) => entry.id !== missing).map((entry) => entry.raw).join('');
    assert.equal(C.validaCopiaCola(finish(body)), false, `campo ${missing}`);
  }
});

test('controles bidi e C0 são rejeitados mesmo com CRC correto', () => {
  const unsafeName = `LOJA\u202EETSET`;
  const body = C.tlv(0, '01')
    + C.tlv(26, C.tlv(0, 'br.gov.bcb.pix') + C.tlv(1, SYNTHETIC_EMAIL))
    + C.tlv(52, '0000') + C.tlv(53, '986') + C.tlv(58, 'BR')
    + rawTlv('59', unsafeName) + C.tlv(60, 'BRASILIA') + C.tlv(62, C.tlv(5, '***'));
  assert.equal(C.validaCopiaCola(finish(body)), false);
});

test('email DICT rejeita Unicode/default-ignorables e segue regex ASCII minúscula', () => {
  for (const invisible of ['\u00AD', '\u061C', '\u034F', '\u2028', '\uFE0F']) {
    const unsafeEmail = `fixture${invisible}@example.com`;
    assert.equal(C.parseChave(unsafeEmail), null, `U+${invisible.codePointAt(0).toString(16)}`);
    assert.throws(() => C.generatePayload(unsafeEmail, 'Loja', 'Brasilia', ''));
  }
  assert.equal(C.parseChave('josé@example.com'), null);
  assert.equal(C.parseChave('jose\u0301@example.com'), null);
  assert.equal(C.parseChave('Fixture@Example.COM').canonical, SYNTHETIC_EMAIL);
  assert.equal(C.parseChave('a@b').canonical, 'a@b');
  assert.equal(C.parseChave(`${'a'.repeat(76)}@b`), null);
});

test('parseTLV mede length em bytes UTF-8 mesmo fora da gramática de chave', () => {
  const map = C.parseTLV('0113josé@example');
  assert.equal(map['01'], 'josé@example');
});

test('tlv exige ID válido, controles seguros e no máximo 99 bytes', () => {
  assert.equal(C.tlv(0, '01'), '000201');
  assert.throws(() => C.tlv(100, 'x'));
  assert.throws(() => C.tlv(1, 'x'.repeat(100)), /99 bytes/);
  assert.throws(() => C.tlv(1, '\u202E'));
});

test('validação fiscal cobre CPF, CNPJ numérico e vetor RFB alfanumérico', () => {
  const cpf = cpfFromBase('123456789');
  const cnpj = cnpjFromBase('123456780001');
  assert.equal(C.validaCPF(cpf), true);
  assert.equal(C.validaCPF(`${cpf.slice(0, -1)}0`), false);
  assert.equal(C.validaCNPJ(cnpj), true);
  assert.equal(C.validaCNPJ(`${cnpj.slice(0, -1)}0`), false);
  assert.equal(C.validaCNPJ('12ABC34501DE35'), true);
  assert.equal(C.validaCNPJ('12abc34501de35'), true);
  assert.equal(C.validaCNPJ('12ABC34501DE36'), false);
});

test('parseChave classifica formatos explícitos e sintéticos', () => {
  const cpf = cpfFromBase('123456789');
  const cpfFormatted = `${cpf.slice(0,3)}.${cpf.slice(3,6)}.${cpf.slice(6,9)}-${cpf.slice(9)}`;
  const cnpj = cnpjFromBase('123456780001');
  const cnpjFormatted = `${cnpj.slice(0,2)}.${cnpj.slice(2,5)}.${cnpj.slice(5,8)}/${cnpj.slice(8,12)}-${cnpj.slice(12)}`;
  assert.equal(C.parseChave(cpfFormatted).tipo, 'cpf');
  assert.equal(C.parseChave(cnpjFormatted).tipo, 'cnpj');
  assert.equal(C.parseChave(SYNTHETIC_EMAIL).tipo, 'email');
  assert.equal(C.parseChave(SYNTHETIC_UUID).tipo, 'aleatoria');
  assert.equal(C.parseChave(OFFICIAL_EVP_NON_V4).tipo, 'aleatoria');
  assert.equal(C.parseChave('(00) 99999-0000').canonical, SYNTHETIC_PHONE);
  assert.equal(C.parseChave('12.abc.345/01de-35').canonical, '12ABC34501DE35');
});

test('11 dígitos puros são CPF; telefone DICT canônico exige + E.164', () => {
  const cpf = cpfFromBase('123456789');
  const parsed = C.parseChave(cpf);
  assert.equal(parsed.tipo, 'cpf');
  assert.equal(parsed.canonical, cpf);
  assert.equal(C.parseChave('+14155552671').canonical, '+14155552671');
  assert.equal(C.isCanonicalPixKey('+14155552671'), true);
});

test('forma telefônica explícita vence colisão sintética com checksum CPF', () => {
  const collision = cpfFromBase('119000001');
  assert.equal(C.validaCPF(collision), true);
  const formatted = `(${collision.slice(0,2)}) ${collision.slice(2,7)}-${collision.slice(7)}`;
  assert.equal(C.parseChave(formatted).tipo, 'telefone');
  assert.equal(C.parseChave(formatted).canonical, `+55${collision}`);
});

test('parseChave não remove lixo arbitrário de chaves', () => {
  assert.equal(C.parseChave(`ZZZ${SYNTHETIC_UUID}YYY`), null);
  assert.equal(C.parseChave('+55xx00999990000yy'), null);
  assert.equal(C.parseChave('telefone 00999990000'), null);
});

test('telefone internacional E.164 é aceito e CNPJ/CPF inválidos falham explicitamente', () => {
  assert.equal(C.parseChave('+15550100000').tipo, 'telefone');
  assert.equal(C.parseChave('12345678000100').tipo, 'cnpj-invalid');
  assert.equal(C.parseChave('12345678901').tipo, 'cpf-invalid');
  assert.equal(C.parseChave('+0123'), null);
  assert.equal(C.parseChave(`+${'1'.repeat(16)}`), null);
});

test('formatChave aceita CPF válido e telefone brasileiro explícito', () => {
  const cpf = cpfFromBase('123456789');
  assert.equal(C.formatChave(cpf), cpf);
  assert.equal(C.formatChave('(00) 99999-0000'), SYNTHETIC_PHONE);
});

const VALID_MONEY = [
  ['1.234,56', '1234.56'], ['10.000,00', '10000.00'],
  ['1234,56', '1234.56'], ['1234.56', '1234.56'], ['1234', '1234.00'],
  ['0,99', '0.99'], ['R$ 1.234,56', '1234.56'],
  ['1,234.56', '1234.56'], ['1.234.567,89', '1234567.89'],
];
for (const [input, expected] of VALID_MONEY) {
  test(`normalizeValor aceita forma válida ${input}`, () => {
    assert.equal(C.normalizeValorParaPayload(input), expected);
  });
}

const INVALID_MONEY = [
  '1.234', '1.2.3', '12.34,56', '1,23.45', '1 0,00', 'R$  10,00',
  '100abc', '1e3', '', '0', '0,00', '0.001', '-5',
  '99999999999.99', '10000000000', '1000000000000000000000',
];
for (const input of INVALID_MONEY) {
  test(`normalizeValor rejeita forma inválida ${JSON.stringify(input)}`, () => {
    assert.equal(C.normalizeValorParaPayload(input), '');
  });
}

test('generatePayload faz roundtrip sintético completo', () => {
  const payload = C.generatePayload(SYNTHETIC_EMAIL, 'Loja Teste', 'Brasilia', '1.234,56', 'PED123');
  const parsed = C.parseCopiaCola(payload);
  assert.equal(C.validaCopiaCola(payload), true);
  assert.equal(parsed.chave, SYNTHETIC_EMAIL);
  assert.equal(parsed.valor, '1234.56');
  assert.equal(parsed.txid, 'PED123');
});

test('generatePayload nunca converte valor inválido não vazio em valor aberto', () => {
  assert.throws(() => C.generatePayload(SYNTHETIC_EMAIL, 'Loja', 'Brasilia', '1e3'), /Valor inválido/);
  assert.throws(() => C.generatePayload(SYNTHETIC_EMAIL, 'Loja', 'Brasilia', '0'), /Valor inválido/);
  assert.throws(() => C.generatePayload(SYNTHETIC_EMAIL, 'Loja', 'Brasilia', '1000000000000000000000'), /Valor inválido/);
});

test('generatePayload rejeita nome/cidade vazios após normalização e txid inválido', () => {
  assert.throws(() => C.generatePayload(SYNTHETIC_EMAIL, '😀', 'Brasilia', ''), /Nome e cidade/);
  assert.throws(() => C.generatePayload(SYNTHETIC_EMAIL, 'Loja', '😀', ''), /Nome e cidade/);
  assert.throws(() => C.generatePayload(SYNTHETIC_EMAIL, 'Loja', 'Brasilia', '', 'PED-123'), /txid/);
  assert.throws(() => C.generatePayload(SYNTHETIC_EMAIL, 'Loja', 'Brasilia', '', 'X'.repeat(26)), /txid/);
});

test('email Unicode nunca entra em payload e EVP não-v4 faz roundtrip', () => {
  assert.throws(() => C.generatePayload('josé@example.com', 'Loja', 'Brasilia', '10,00', 'UNICODE1'));
  const payload = C.generatePayload(OFFICIAL_EVP_NON_V4, 'Loja', 'Brasilia', '10,00', 'EVP1');
  assert.equal(C.parseCopiaCola(payload).chave, OFFICIAL_EVP_NON_V4);
});

test('email acima de 77 caracteres falha fechado antes do TLV', () => {
  assert.throws(() => C.generatePayload(`${'a'.repeat(76)}@b`, 'Loja', 'Brasilia', ''));
});

test('withStaticAmount preserva todos os TLVs originais byte a byte', () => {
  const original = makeStatic({
    txid: 'PRESERVE1',
    merchantExtra: C.tlv(2, 'EXTENSAO'),
    mcc: '1234',
    postal: '70000000',
    additionalExtra: C.tlv(7, 'EXTRA'),
  });
  const updated = C.withStaticAmount(original, '45,67');
  assert.equal(C.validaCopiaCola(updated), true);
  assert.equal(C.parseCopiaCola(updated).valor, '45.67');

  const before = C.parseTLVStrict(original, true).entries.map((entry) => entry.raw);
  const after = C.parseTLVStrict(updated, true).entries
    .filter((entry) => entry.id !== '54')
    .map((entry) => entry.raw);
  assert.deepEqual(after, before);
});

test('withStaticAmount rejeita dinâmico, valor existente e entrada inválida', () => {
  assert.throws(() => C.withStaticAmount(makeDynamic(), '1,00'), /estático/);
  assert.throws(() => C.withStaticAmount(makeStatic({ amount: '1.00' }), '2,00'), /já contém/);
  assert.throws(() => C.withStaticAmount(makeStatic(), '1e3'), /Valor inválido/);
  assert.throws(() => C.withStaticAmount(OFFICIAL_BCB_COMPOSITE_RECURRENCE_ONLY, '1,00'), /estático/);
});

test('withStaticAmount aceita o trilho estático de um composto e preserva recorrência', () => {
  const source = OFFICIAL_BCB_COMPOSITE_STATIC.replace('5406100.50', '');
  const body = source.slice(0, -8);
  const openAmount = finish(body);
  assert.equal(C.parseCopiaCola(openAmount).paymentType, 'static');
  const updated = C.withStaticAmount(openAmount, '25,00');
  const parsed = C.parseCopiaCola(updated);
  assert.equal(parsed.valor, '25.00');
  assert.equal(parsed.isComposto, true);
  assert.equal(parsed.recurrenceLocation, 'pix.example.com/rec/2353c790eefb11eaadc10242ac120002');
});
