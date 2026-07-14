// Gate de inventário e integridade dos assets vendorizados (CI, job sanity):
// cada arquivo listado
// em third-party.lock.json precisa bater byte a byte com o sha256 registrado.
// São ~150KB de JS de terceiros parseando payloads Pix — a maior superfície
// de supply chain do projeto. Lib alterada sem atualizar o lock (ou lock
// desatualizado) = CI vermelho; atualização de lib vira um diff explícito e
// revisável no lock, nunca uma troca silenciosa de bytes.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const lock = JSON.parse(readFileSync('third-party.lock.json', 'utf8'));
let bad = 0;
for (const [file, meta] of Object.entries(lock.files)) {
  let actual;
  try {
    actual = createHash('sha256').update(readFileSync(file)).digest('hex');
  } catch {
    console.error(`VENDORED FAIL: ${file} listado no lock mas ausente do repo`);
    bad += 1;
    continue;
  }
  if (actual !== meta.sha256) {
    console.error(`VENDORED FAIL: ${file} sha256=${actual} ≠ lock=${meta.sha256} (${meta.version}, ${meta.origin}) — atualize o third-party.lock.json se a troca foi intencional`);
    bad += 1;
  } else {
    console.log(`vendored ok: ${file} ${meta.version} (${meta.license}, ${meta.origin})`);
  }
}
if (bad) process.exit(1);
console.log('[check-vendored] integridade de todos os assets e licenças confirmada');
