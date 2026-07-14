/* pix-core.js — núcleo PURO do pix2qr: geração e validação de payload PIX
 * (EMV-MPM / BR Code) + parsing de chave e Copia-e-Cola. ZERO dependência de DOM.
 * Funções puras, testáveis isoladamente em test/pix-core.test.js via `node --test`.
 *
 * No browser: carregue como <script> comum (define globals) ANTES de app.js —
 * app.js consome estas funções como globals. Em Node: exporta via module.exports
 * (rodapé). Sem bundler, sem dependências, condizente com o app no-build. */

function normalizeText(s) {
  if (!s) return '';
  // PIX Merchant Name/City: apenas ASCII imprimível (spec BCB).
  // NFKD separa acentos, strip combining marks, depois remove qualquer coisa fora de \x20-\x7E
  // (inclui emoji, caracteres asiáticos, surrogate pairs etc).
  return s.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .toUpperCase();
}

function crc16(str) {
  let crc = 0xFFFF;
  const poly = 0x1021;
  const bytes = new TextEncoder().encode(str);
  for (const byte of bytes) {
    crc ^= (byte << 8);
    for (let i = 0; i < 8; i++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ poly) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Controles, formatos e code points default-ignorable podem fazer um campo
// hostil parecer outro na tela. Esses caracteres nunca são dados válidos de
// pagamento. A propriedade Unicode evita
// manter uma denylist manual incompleta (soft hyphen, ALM, CGJ, variation
// selectors etc.).
function hasUnsafeText(str) {
  return /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/u.test(str);
}

// Gramática publicada na API DICT 2.12.0. O e-mail é ASCII, minúsculo e tem
// no máximo 77 caracteres; EVP é um UUID hexadecimal canônico, sem restrição
// de versão/variant. CPF/CNPJ passam também pelos DVs oficiais abaixo para não
// gerar uma chave fiscal sintaticamente plausível, mas impossível.
function isPixEmail(key) {
  return typeof key === 'string'
    && key.length <= 77
    && /^[a-z0-9.!#$'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/.test(key);
}

function pixLocationUrl(location) {
  if (typeof location !== 'string'
      || !/^[\x21-\x7E]{1,77}$/.test(location)
      || location.includes('://')
      || /[\\\s?#]/.test(location)) return null;

  // Valida a autoridade crua antes de URL(): a API apaga a porta HTTPS padrão
  // (":443" vira url.port === ''), o que impediria distinguir uma location não
  // canônica. PIX location não aceita porta nem userinfo.
  const pathStart = location.indexOf('/');
  if (pathStart <= 0) return null;
  const rawAuthority = location.slice(0, pathStart);
  if (rawAuthority.includes(':') || rawAuthority.includes('@')) return null;

  // O vetor BCB dinâmico usa FQDN/urlAccessToken, enquanto recorrência usa
  // FQDN/pixEndpoint/urlAccessToken. Portanto exigimos um ou mais segmentos
  // não vazios (sempre com token final), preservando ambos os layouts oficiais.
  // Cada segmento é decodificado isoladamente: assim %2F nunca pode criar uma
  // nova hierarquia depois que proxy/aplicação discordarem sobre o decode.
  const rawSegments = location.slice(pathStart + 1).split('/');
  if (rawSegments.some((segment) => !segment)) return null;
  for (const rawSegment of rawSegments) {
    let decoded = rawSegment;
    for (let pass = 0; pass < 4 && decoded.includes('%'); pass++) {
      try {
        const next = decodeURIComponent(decoded);
        if (next === decoded) return null;
        decoded = next;
      } catch {
        return null;
      }
    }
    // '%' restante implica encoding excessivamente recursivo/malformado. Após
    // decode só aceitamos pchar RFC 3986 ASCII visível; controles, espaço,
    // Unicode, barra/backslash e delimitadores de query/fragmento ficam fora.
    if (decoded.includes('%') || decoded === '.' || decoded === '..'
        || !/^[A-Za-z0-9._~!$&'()*+,;=:@-]+$/.test(decoded)) return null;
  }

  try {
    const url = new URL(`https://${location}`);
    const hostname = url.hostname.toLowerCase();
    if (!hostname || url.username || url.password || url.search || url.hash || url.port) return null;

    // Somente FQDN DNS público. URL() aceita underscores, nomes de um label e
    // várias grafias numéricas de IP (por exemplo 2130706433 -> 127.0.0.1),
    // que não são locations PIX públicas seguras.
    if (hostname.length > 253 || !hostname.includes('.') || hostname.endsWith('.')) return null;
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) return null;
    if (hostname.startsWith('[') || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return null;
    if (hostname !== rawAuthority.toLowerCase()) return null;
    const labels = hostname.split('.');
    if (labels.some((label) => label.length < 1 || label.length > 63
        || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) return null;
    return url;
  } catch {
    return null;
  }
}

function isCanonicalPixKey(key) {
  if (typeof key !== 'string' || !key || hasUnsafeText(key)) return false;
  if (/^\d{11}$/.test(key)) return validaCPF(key);
  if (/^[a-z0-9]{14}$/i.test(key)) return validaCNPJ(key);
  if (/^\+[1-9]\d{1,14}$/.test(key)) return true;
  if (isPixEmail(key) && key === key.toLowerCase()) return true;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(key);
}

// Retorna a inspeção estrita de um Copia-e-Cola ou null. CRC correto sozinho
// não prova que a estrutura representa PIX: todos os TLVs precisam ser
// consumidos, únicos e ordenados, seguidos pelos invariantes BR Code/PIX.
function inspectCopiaCola(payload) {
  if (typeof payload !== 'string' || payload !== payload.trim()) return null;
  const payloadBytes = new TextEncoder().encode(payload).length;
  if (payloadBytes < 14 || payloadBytes > 1024 || hasUnsafeText(payload)) return null;
  if (!payload.startsWith('000201') || !/6304[0-9A-F]{4}$/.test(payload)) return null;

  const crcStart = payload.length - 4;
  if (crc16(payload.substring(0, crcStart)) !== payload.substring(crcStart)) return null;

  const topInfo = parseTLVStrict(payload, true);
  if (!topInfo) return null;
  const top = topInfo.fields;
  if (topInfo.entries[0]?.id !== '00' || top['00'] !== '01' || top['63'] !== undefined) return null;
  if (!/^\d{4}$/.test(top['52'] || '') || top['53'] !== '986' || top['58'] !== 'BR') return null;
  if (!/^[\x20-\x7E]{1,25}$/.test(top['59'] || '')) return null;
  if (!/^[\x20-\x7E]{1,15}$/.test(top['60'] || '')) return null;

  const poi = top['01'];
  if (poi !== undefined && poi !== '11' && poi !== '12') return null;

  const additionalInfo = top['62'] ? parseTLVStrict(top['62']) : null;
  if (!additionalInfo) return null;

  // O BR Code permite um ou mais Merchant Account Information em 26..51.
  // Localizamos o arranjo Pix pelo GUI em vez de presumir o ID 26.
  const pixMerchants = topInfo.entries
    .filter((entry) => Number(entry.id) >= 26 && Number(entry.id) <= 51)
    .map((entry) => ({ id: entry.id, info: parseTLVStrict(entry.value) }))
    .filter((entry) => (entry.info?.fields['00'] || '').toLowerCase() === 'br.gov.bcb.pix');
  if (pixMerchants.length !== 1) return null;
  const merchantInfo = pixMerchants[0].info;
  const merchant = merchantInfo.fields;
  const additional = additionalInfo.fields;

  // Pix Automático usa exatamente um Unreserved Template Pix em 80..99, com
  // GUI e location da recorrência em 25. Templates de outros arranjos podem
  // coexistir e são ignorados.
  const pixRecurrences = topInfo.entries
    .filter((entry) => Number(entry.id) >= 80 && Number(entry.id) <= 99)
    .map((entry) => ({ id: entry.id, info: parseTLVStrict(entry.value) }))
    .filter((entry) => (entry.info?.fields['00'] || '').toLowerCase() === 'br.gov.bcb.pix');
  if (pixRecurrences.length > 1) return null;
  const recurrenceInfo = pixRecurrences[0]?.info || null;
  const recurrenceLocation = recurrenceInfo?.fields['25'] || '';
  const recurrenceUrl = recurrenceInfo ? pixLocationUrl(recurrenceLocation) : null;
  if (recurrenceInfo && !recurrenceUrl) return null;

  const hasKey = typeof merchant['01'] === 'string' && merchant['01'].length > 0;
  const hasLocation = typeof merchant['25'] === 'string' && merchant['25'].length > 0;
  if (hasKey && hasLocation) return null;
  if (!hasKey && !hasLocation && !recurrenceInfo) return null;
  if ((poi === '12' && !hasLocation) || (poi === '11' && hasLocation)) return null;
  if (!hasKey && !hasLocation && poi !== undefined) return null;

  if (hasKey) {
    // A chave dentro do BR Code já precisa estar no formato canônico; aceitar
    // pontuação/ruído aqui criaria um payload com CRC válido mas chave inválida.
    if (!isCanonicalPixKey(merchant['01'])) return null;
  } else {
    if (hasLocation && !pixLocationUrl(merchant['25'])) return null;
  }

  // Em composto dinâmico, o manual exige o mesmo FQDN nas duas locations.
  if (hasLocation && recurrenceUrl
      && pixLocationUrl(merchant['25']).hostname.toLowerCase() !== recurrenceUrl.hostname.toLowerCase()) {
    return null;
  }

  if (top['54'] !== undefined) {
    if (!/^\d{1,10}\.\d{2}$/.test(top['54'])) return null;
    const amount = Number(top['54']);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    if (!hasKey && !hasLocation) return null;
  }

  const txid = additional['05'];
  if (typeof txid !== 'string' || !/^(?:\*\*\*|[A-Za-z0-9]{1,25})$/.test(txid)) return null;

  const isDinamico = hasLocation;
  const isComposto = Boolean(recurrenceInfo);
  const paymentType = hasKey ? 'static' : (hasLocation ? 'dynamic' : 'none');
  return {
    topInfo,
    merchantInfo,
    additionalInfo,
    parsed: {
      isDinamico,
      isComposto,
      paymentType,
      chave: hasKey ? merchant['01'] : '',
      location: hasLocation ? merchant['25'] : '',
      recurrenceLocation,
      valor: top['54'] || '',
      moeda: top['53'],
      nome: top['59'],
      cidade: top['60'],
      pais: top['58'],
      txid,
      merchantAccountId: pixMerchants[0].id,
      recurrenceTemplateId: pixRecurrences[0]?.id || '',
    },
  };
}

function validaCopiaCola(str) {
  return inspectCopiaCola(str) !== null;
}

function tlv(id, value) {
  const idStr = id.toString().padStart(2, '0');
  if (!/^\d{2}$/.test(idStr) || typeof value !== 'string' || hasUnsafeText(value)) {
    throw new Error('TLV exige ID de 00 a 99 e valor textual sem controles invisíveis.');
  }
  const byteLen = new TextEncoder().encode(value).length;
  // O slot de length na EMV-MPM tem 2 dígitos → no máximo 99 bytes por campo.
  // Acima disso, padStart(2) NÃO trunca e emitiria 3 chars ("106"), gerando um
  // TLV fisicamente malformado: mesmo um parser de banco correto lê o length
  // errado e perde a chave PIX. Lançar aqui é a última linha de defesa — o
  // caller (generatePayload) roda sob try/catch e mostra erro em vez de produzir
  // um QR de pagamento quebrado. Pega chave acentuada longa E txid grande.
  if (byteLen > 99) {
    throw new Error(`Campo ${idStr} excede o limite de 99 bytes (tem ${byteLen}).`);
  }
  const lenStr = byteLen.toString().padStart(2, '0');
  return `${idStr}${lenStr}${value}`;
}

// Parser TLV estrito interno. Além do mapa, preserva os segmentos crus em ordem
// para mutações seguras que não podem descartar campos desconhecidos.
function parseTLVStrict(str, topLevel = false) {
  if (typeof str !== 'string' || hasUnsafeText(str)) return null;
  const map = Object.create(null);
  const entries = [];
  // EMV-MPM mede length em BYTES UTF-8. Indexar por code units (str.substring)
  // corrompe campos com chave acentuada: 'josé@example.com' usa mais bytes que
  // code units, então substring(.,15) roubaria 1 char do campo seguinte
  // code units e poderia roubar o início do campo seguinte. Operamos em bytes.
  const bytes = new TextEncoder().encode(str);
  const dec = new TextDecoder('utf-8', { fatal: true });
  const end = topLevel ? bytes.length - 8 : bytes.length;  // últimos 8 = "6304"+CRC
  if (end < 0) return null;
  let i = 0;
  let previousId = -1;
  while (i < end) {
    if (i + 4 > end) return null;
    let id;
    let lenStr;
    try {
      id = dec.decode(bytes.subarray(i, i + 2));
      lenStr = dec.decode(bytes.subarray(i + 2, i + 4));
    } catch {
      return null;
    }
    // O length tem que ser exatamente 2 dígitos ASCII. Qualquer outra coisa
    // (ex.: "5A") é payload malformado → para o parse em vez de truncar o campo
    // (parseInt('5A',10) daria 5 e desincronizaria o resto).
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(lenStr)) return null;
    const numericId = Number(id);
    if (numericId <= previousId || map[id] !== undefined) return null;
    const len = parseInt(lenStr, 10);
    const next = i + 4 + len;
    if (next > end) return null;
    let value;
    let raw;
    try {
      value = dec.decode(bytes.subarray(i + 4, next));
      raw = dec.decode(bytes.subarray(i, next));
    } catch {
      return null;
    }
    if (hasUnsafeText(value)) return null;
    map[id] = value;
    entries.push({ id, value, raw });
    previousId = numericId;
    i = next;
  }
  return i === end ? { fields: map, entries } : null;
}

// API pública compatível: payload inválido devolve mapa vazio, nunca parcial.
function parseTLV(str, topLevel = false) {
  return parseTLVStrict(str, topLevel)?.fields || {};
}

// Extrai campos high-level de um Copia-e-Cola.
// Retorna null se inválido. Caller deve checar validaCopiaCola antes.
//
// Diferenças QR Estático vs Dinâmico (spec BCB MCD 1.0):
//   - Estático (tag 01="11" ou ausente):
//       campo 26 tem GUI(00) + chave(01); valor pode estar no campo 54.
//   - Dinâmico (tag 01="12"):
//       campo 26 tem GUI(00) + URL location(25); valor NÃO está no QR — fica
//       no servidor do PSP, app do banco busca via HTTP no momento do pagamento.
function parseCopiaCola(payload) {
  return inspectCopiaCola(payload)?.parsed || null;
}

function validaCPF(d) {
  if (/^(\d)\1{10}$/.test(d)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += +d[i] * (10 - i);
  let r = (s * 10) % 11; if (r >= 10) r = 0;
  if (r !== +d[9]) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += +d[i] * (11 - i);
  r = (s * 10) % 11; if (r >= 10) r = 0;
  return r === +d[10];
}

function validaCNPJ(d) {
  const canonical = String(d || '').toUpperCase();
  // RFB: 12 posições alfanuméricas + dois DVs numéricos. Cada caractere vale
  // seu código ASCII menos 48, com módulo 11 e pesos 2..9 da direita para a
  // esquerda. A mesma rotina preserva todos os CNPJs numéricos existentes.
  if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(canonical)) return false;
  if (/^(\d)\1{13}$/.test(canonical)) return false;
  const digit = (base) => {
    let sum = 0;
    let weight = 2;
    for (let i = base.length - 1; i >= 0; i--) {
      sum += (base.charCodeAt(i) - 48) * weight;
      weight = weight === 9 ? 2 : weight + 1;
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const first = digit(canonical.slice(0, 12));
  const second = digit(canonical.slice(0, 12) + first);
  return canonical.endsWith(`${first}${second}`);
}

// Identifica tipo de chave e retorna { tipo, canonical, display }.
// - canonical: string que vai pro payload PIX (sem formatação visual)
// - display:   string formatada para exibir no input
// Retorna null quando não consegue classificar (deixa o input intocado).
function parseChave(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;

  // PIX Copia e Cola (payload EMV): valida CRC16 + estrutura mínima
  if (trimmed.startsWith('000201')) {
    if (validaCopiaCola(trimmed)) {
      return { tipo: 'copia-cola', canonical: trimmed, display: trimmed };
    }
    return { tipo: 'copia-cola-invalid', canonical: trimmed, display: trimmed };
  }

  // Email (DICT 2.12): ASCII, minúsculo e no máximo 77 caracteres. Aceitamos
  // maiúsculas apenas como conveniência de entrada e normalizamos antes de
  // validar; Unicode não faz parte da gramática oficial.
  const lowerEmail = trimmed.toLowerCase();
  if (!hasUnsafeText(trimmed)
      && /^[\x20-\x7E]+$/.test(trimmed)
      && isPixEmail(lowerEmail)) {
    return { tipo: 'email', canonical: lowerEmail, display: lowerEmail };
  }

  // EVP: UUID hexadecimal canônico. A API DICT não restringe versão/variant.
  const uuidRaw = trimmed.toLowerCase();
  const uuidShape = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
  const hexOnly = uuidShape.test(uuidRaw) ? uuidRaw.replace(/-/g, '') : '';
  if (/^[0-9a-f]{32}$/.test(hexOnly)) {
    const uuid = `${hexOnly.slice(0,8)}-${hexOnly.slice(8,12)}-${hexOnly.slice(12,16)}-${hexOnly.slice(16,20)}-${hexOnly.slice(20,32)}`;
    return { tipo: 'aleatoria', canonical: uuid, display: uuid };
  }

  // CNPJ alfanumérico (RFB/DICT): case-insensitive na entrada, canonical em
  // maiúsculas e máscara tradicional. A forma sem pontuação tem 14 posições;
  // a forma pontuada mantém o mesmo layout do CNPJ numérico.
  const cnpjUnformatted = /^[A-Za-z0-9]{14}$/.test(trimmed);
  const cnpjFormatted = /^[A-Za-z0-9]{2}\.[A-Za-z0-9]{3}\.[A-Za-z0-9]{3}\/[A-Za-z0-9]{4}-[0-9]{2}$/.test(trimmed);
  if (cnpjUnformatted || cnpjFormatted) {
    const canonical = trimmed.replace(/[.\/-]/g, '').toUpperCase();
    if (validaCNPJ(canonical)) {
      const display = `${canonical.slice(0,2)}.${canonical.slice(2,5)}.${canonical.slice(5,8)}/${canonical.slice(8,12)}-${canonical.slice(12,14)}`;
      return { tipo: 'cnpj', canonical, display };
    }
    return { tipo: 'cnpj-invalid', canonical, display: trimmed };
  }

  // Só pontuação documentada de CPF/CNPJ/telefone pode ser removida. Antes,
  // texto arbitrário em volta de dígitos/UUID era silenciosamente descartado.
  if (!/^[0-9+()./\-\s]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  // PHONE: E.164 segundo o DICT (+ e 2..15 dígitos, primeiro 1..9). Pontuação
  // visual é removida somente neste ramo explícito com "+".
  if (trimmed.startsWith('+')) {
    if (!/^\+[0-9().\-\s]+$/.test(trimmed)) return null;
    if (!/^[1-9]\d{1,14}$/.test(digits)) return null;
    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
      return formatarTelefoneBR(digits);
    }
    return { tipo: 'telefone', canonical: `+${digits}`, display: `+${digits}` };
  }

  const plainDigits = /^\d+$/.test(trimmed);
  const explicitPhone = /^\(\d{2}\)\s?\d{4,5}-?\d{4}$/.test(trimmed)
    || /^\d{2}\s+\d{4,5}-?\d{4}$/.test(trimmed);

  // Forma telefônica explícita vence mesmo se os 11 dígitos colidirem por acaso
  // com um checksum de CPF válido.
  if (explicitPhone && (digits.length === 10 || digits.length === 11)) {
    return formatarTelefoneBR(`55${digits}`);
  }

  // CPF tem exatamente 11 dígitos no DICT. Telefone canônico sempre começa
  // com "+", portanto 11 dígitos puros não são reinterpretados como telefone.
  if (digits.length === 11) {
    const cpfFormatted = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(trimmed);
    if (!plainDigits && !cpfFormatted) return null;
    if (!validaCPF(digits)) return { tipo: 'cpf-invalid', canonical: digits, display: trimmed };
    const display = `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9,11)}`;
    return { tipo: 'cpf', canonical: digits, display };
  }

  // Telefone BR sem prefixo + (10 dígitos ou 12/13 começando com 55)
  if (plainDigits && digits.length === 10) return formatarTelefoneBR(`55${digits}`);
  if (plainDigits && digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return formatarTelefoneBR(digits);

  return null;
}

// digits esperado: 55 + DDD + 8 ou 9 dígitos (total 12 ou 13)
function formatarTelefoneBR(digits) {
  const canonical = `+${digits}`;
  const ddd = digits.slice(2, 4);
  const resto = digits.slice(4);
  const meio = resto.length === 9 ? resto.slice(0, 5) : resto.slice(0, 4);
  const fim  = resto.length === 9 ? resto.slice(5)    : resto.slice(4);
  const display = `+55 (${ddd}) ${meio}-${fim}`;
  return { tipo: 'telefone', canonical, display };
}

// Devolve o canonical pra ser embutido no payload PIX.
// Lança para qualquer input inválido — o caller deve ter bloqueado antes,
// mas isso é a última linha de defesa contra gerar um QR com chave lixo.
function formatChave(raw) {
  const parsed = parseChave(raw);
  if (!parsed) {
    throw new Error('Chave PIX inválida.');
  }
  if (parsed.tipo === 'cpf-invalid') throw new Error('CPF inválido. Confira os dígitos.');
  if (parsed.tipo === 'cnpj-invalid') {
    throw new Error('CNPJ inválido. Confira os dígitos.');
  }
  if (parsed.tipo === 'copia-cola-invalid') {
    throw new Error('Pix Copia e Cola inválido. Confira o código.');
  }
  return parsed.canonical;
}

// Normaliza um valor monetário digitado para a string do campo 54 do payload
// ("1234.56"). Retorna '' se vazio/zerado/inválido — '' significa "sem valor"
// (QR de valor em aberto, o pagador digita), que é válido no PIX.
//
// Regra de ouro (app financeiro): NUNCA retornar um número ERRADO. Entrada
// ambígua ou malformada vira '' (sem valor), nunca um valor truncado/coagido.
// O bug antigo — `replace(',', '.')` trocava só a 1ª vírgula e deixava os
// pontos — fazia "1.234,56" virar parseFloat("1.234.56") = 1.23 (paga R$ 1,23
// no lugar de R$ 1.234,56), silenciosamente.
function normalizeValorParaPayload(raw) {
  if (raw == null) return '';
  let s = String(raw).trim();
  if (/^R\$/i.test(s)) s = s.replace(/^R\$ ?/i, '');
  if (!s) return '';
  // Gramáticas explícitas: agrupamento quebrado ou espaços internos nunca são
  // "adivinhados". Um único separador com 3 casas ("1.234") é ambíguo e falha.
  if (/\s/.test(s)) return '';
  if (/^\d+$/.test(s)) {
    // inteiro simples
  } else if (/^\d+[.,]\d{1,2}$/.test(s)) {
    s = s.replace(',', '.');
  } else if (/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(?:,\d{3})+\.\d{1,2}$/.test(s)) {
    s = s.replace(/,/g, '');
  } else {
    return '';
  }
  const n = parseFloat(s);
  if (!isFinite(n) || n <= 0) return '';
  const fixed = n.toFixed(2);
  // Number#toFixed usa notação exponencial a partir de 1e21. O pós-condição
  // garante ao mesmo tempo a gramática canônica e o limite de 13 bytes do
  // campo 54 (até dez dígitos inteiros + ponto + dois decimais).
  if (!/^\d{1,10}\.\d{2}$/.test(fixed)) return '';
  // Valor que arredonda pra 0.00 (ex.: 0.001) = sem valor; não embute 54040.00
  // (campo 54, quando presente, deve ser > 0 por BCB/EMV).
  if (parseFloat(fixed) <= 0) return '';
  return fixed;
}

// Converte o que o usuário digitou para o formato de exibição BR (vírgula).
// Retorna '' se inválido/vazio/zero.
function formatarValorBR(raw) {
  const asPayload = normalizeValorParaPayload(raw);
  if (!asPayload) return '';
  return asPayload.replace('.', ',');
}

function generatePayload(chave, nome, cidade, valor, txid) {
  const chaveFormatada = formatChave(chave);
  const nomeFinal   = normalizeText(nome   || 'PIX').slice(0, 25);
  const cidadeFinal = normalizeText(cidade || 'SAO PAULO').slice(0, 15);
  if (!nomeFinal || !cidadeFinal) {
    throw new Error('Nome e cidade precisam conter caracteres ASCII visíveis.');
  }
  let parteValor = '';
  const valorNorm = normalizeValorParaPayload(valor);
  if (valor != null && String(valor).trim() && !valorNorm) {
    throw new Error('Valor inválido; o QR não será gerado como valor em aberto.');
  }
  if (valorNorm) {
    parteValor = tlv(54, valorNorm);
  }
  const txidFinal = txid || '***';
  if (!/^(?:\*\*\*|[A-Za-z0-9]{1,25})$/.test(txidFinal)) {
    throw new Error('txid deve ter até 25 caracteres alfanuméricos ou ser ***.');
  }
  const payload =
    tlv(0,  '01') +
    tlv(26, tlv(0, 'br.gov.bcb.pix') + tlv(1, chaveFormatada)) +
    tlv(52, '0000') +
    tlv(53, '986') +
    parteValor +
    tlv(58, 'BR') +
    tlv(59, nomeFinal) +
    tlv(60, cidadeFinal) +
    // Preserva o txid original (campo 62, subcampo 05) quando reconstruímos um
    // payload — ex.: ao adicionar valor a um Copia-e-Cola estático escaneado.
    // Sem isso, a referência de conciliação do lojista (ex.: "PEDIDO12345")
    // era trocada por "***" silenciosamente. '***' é o placeholder padrão
    // quando não há txid.
    tlv(62, tlv(5, txidFinal)) +
    '6304';
  return payload + crc16(payload);
}

// Insere valor em um BR Code estático sem reconstruir o payload. Todos os TLVs
// originais (inclusive extensões desconhecidas) permanecem byte a byte; apenas
// o novo campo 54 e o CRC final são acrescentados.
function withStaticAmount(payload, rawAmount) {
  const inspected = inspectCopiaCola(payload);
  if (!inspected || inspected.parsed.paymentType !== 'static') {
    throw new Error('Somente um Copia-e-Cola PIX estático válido pode receber valor.');
  }
  if (inspected.parsed.valor) throw new Error('O Copia-e-Cola já contém valor.');
  const amount = normalizeValorParaPayload(rawAmount);
  if (!amount) throw new Error('Valor inválido.');

  let inserted = false;
  let body = '';
  for (const entry of inspected.topInfo.entries) {
    if (!inserted && Number(entry.id) > 54) {
      body += tlv(54, amount);
      inserted = true;
    }
    body += entry.raw;
  }
  if (!inserted) body += tlv(54, amount);
  body += '6304';
  return body + crc16(body);
}

// ── Export dual: no browser as funções acima já são globals (declarações de
//    função em script clássico); em Node, expõe pra os testes. ──────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeText, crc16, hasUnsafeText, isPixEmail, pixLocationUrl,
    isCanonicalPixKey, inspectCopiaCola,
    validaCopiaCola, tlv, parseTLVStrict, parseTLV, parseCopiaCola,
    validaCPF, validaCNPJ, parseChave, formatarTelefoneBR, formatChave,
    normalizeValorParaPayload, formatarValorBR, generatePayload, withStaticAmount,
  };
}
