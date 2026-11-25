// Leitura dos arquivos de hospedagem da Cloudflare (_headers, _redirects e
// wrangler.jsonc) para os gates e testes. Enquanto a Vercel servir a produção,
// vercel.json e estes arquivos descrevem o mesmo site; quem compara os dois usa
// os parsers daqui, para que a regra de leitura seja uma só.
// CommonJS de propósito: os testes (node --test, CJS) e o gate .mjs importam o
// mesmo arquivo em qualquer Node da CI.
'use strict';

// _headers: blocos de "padrão de URL" seguido de linhas indentadas
// "Nome: valor". Comentários começam com #. Devolve as regras na ordem.
function parseHeadersFile(text) {
  const rules = [];
  let current = null;
  for (const [index, raw] of text.split('\n').entries()) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      current = { pattern: line.trim(), headers: [] };
      rules.push(current);
      continue;
    }
    if (!current) throw new Error(`_headers linha ${index + 1}: cabeçalho antes de qualquer padrão de URL`);
    const match = line.trim().match(/^([A-Za-z0-9-]+):\s(.+)$/);
    if (!match) throw new Error(`_headers linha ${index + 1}: esperado "Nome: valor"`);
    current.headers.push({ key: match[1], value: match[2] });
  }
  return rules;
}

// _redirects: uma regra por linha, "origem destino [status]".
function parseRedirectsFile(text) {
  return text.split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const [source, destination, status, ...rest] = line.split(/\s+/);
      if (!destination || rest.length) throw new Error(`_redirects: linha fora do formato "origem destino [status]": ${line}`);
      return { source, destination, status: status ? Number(status) : 302 };
    });
}

// JSONC do wrangler: tira comentários // e /* */ fora de strings e lê como JSON.
function parseJsonc(text) {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === '\\') { out += text[i + 1] ?? ''; i += 1; } else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      out += '\n';
    } else if (ch === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2);
      if (i === -1) throw new Error('wrangler.jsonc: comentário /* sem fechamento');
      i += 1;
    } else {
      out += ch;
    }
  }
  return JSON.parse(out);
}

// Cabeçalhos que o vercel.json aplica em toda rota ("source": "/(.*)" sem has).
function vercelGlobalHeaders(vercel) {
  return vercel.headers
    .filter((rule) => rule.source === '/(.*)' && !rule.has)
    .flatMap((rule) => rule.headers);
}

// Cabeçalhos que o _headers aplica em toda rota (padrão "/*").
function cloudflareGlobalHeaders(rules) {
  return rules.filter((rule) => rule.pattern === '/*').flatMap((rule) => rule.headers);
}

module.exports = {
  parseHeadersFile,
  parseRedirectsFile,
  parseJsonc,
  vercelGlobalHeaders,
  cloudflareGlobalHeaders,
};
