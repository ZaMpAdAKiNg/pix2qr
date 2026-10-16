/* app.js — camada de UI/DOM do pix2qr. As funções puras de PIX (crc16, tlv,
 * parseChave, parseCopiaCola, generatePayload, normalizeValorParaPayload, etc.)
 * vivem em pix-core.js, carregado ANTES deste arquivo (ver index.html). */

const chaveInput     = document.getElementById('chave-input');
const nomeInput      = document.getElementById('nome-input');
const cidadeInput    = document.getElementById('cidade-input');
const valorInput     = document.getElementById('valor-input');
const extraFields    = document.getElementById('extra-fields');
const modeTagEl      = document.getElementById('mode-tag');
const modeLabelEl    = document.getElementById('mode-label');
const errorMsg       = document.getElementById('error-msg');
const gerarBtn       = document.getElementById('gerar-btn');
const resultEl       = document.getElementById('result');
const resultHeader   = resultEl.querySelector('.result-header');
const qrWrap         = document.getElementById('qr-wrap');
const qrContainer    = document.getElementById('qr-container');
const payloadDisplay = document.getElementById('payload-display');
const keyHint        = document.getElementById('key-hint');
const copyBtn        = document.getElementById('copy-btn');
const downloadBtn    = document.getElementById('download-btn');
const downloadSvgBtn = document.getElementById('download-svg-btn');
const copyImgBtn     = document.getElementById('copy-img-btn');

let currentPayload = '';

function detectMode(value) {
  const v = value.trim();
  if (!v) return null;
  return v.startsWith('000201') ? 'copia-cola' : 'chave';
}

// Mapa de mensagens de erro por tipo de input inválido.
// Usado em blur e no click do gerar pra dar feedback preciso ao usuário.
const CHAVE_ERROR_BY_TIPO = {
  'cpf-invalid':        'CPF inválido. Confira os dígitos.',
  'cnpj-invalid':       'CNPJ inválido. Confira os dígitos.',
  'copia-cola-invalid': 'Pix Copia e Cola inválido. Confira o código.',
};

// Invalida QR / payload anterior — chamado em qualquer caminho de erro
// pra que o resultado da geração passada não confunda o usuário.
function invalidateResult() {
  resultEl.classList.remove('visible');
  qrWrap.replaceChildren();
  payloadDisplay.textContent = '';
  keyHint.hidden = true;
  currentPayload = '';
}

// Mostra erro específico se input for inválido.
// Retorna true se houve erro (caller deve dar return).
function showChaveErrorIfInvalid(parsed, raw) {
  if (!raw || !raw.trim()) return false; // vazio não é erro
  if (!parsed) {
    errorMsg.textContent = 'Chave PIX inválida. Use CPF, CNPJ, e-mail ASCII, telefone E.164 (com +) ou chave aleatória.';
    invalidateResult();
    return true;
  }
  const msg = CHAVE_ERROR_BY_TIPO[parsed.tipo];
  if (msg) {
    errorMsg.textContent = msg;
    invalidateResult();
    return true;
  }
  return false;
}

// Label humano do mode-pill pra cada tipo detectado
const TIPO_LABEL = {
  cpf:       'CPF',
  cnpj:      'CNPJ',
  email:     'E-mail',
  telefone:  'Telefone',
  aleatoria: 'Chave aleatória',
};

// Aviso exibido no resultado quando o QR é gerado a partir de uma CHAVE: a chave
// PIX precisa estar cadastrada no PSP (banco) do recebedor pra receber. Um QR
// pix2qr é EMV-válido e escaneia, mas se a chave não estiver registrada, o app do
// banco recusa — e o usuário interpreta como "não escaneia/não funciona". Não há
// aviso pra Copia-e-Cola: ele já vem de um PSP, com a chave registrada. Mensagens
// explícitas por tipo pra concordância correta (cadastrado/cadastrada).
const KEY_HINT = {
  cpf:       'Confirme que esse CPF está cadastrado como chave PIX no banco de quem vai receber — senão o pagamento não será reconhecido.',
  cnpj:      'Confirme que esse CNPJ está cadastrado como chave PIX no banco de quem vai receber — senão o pagamento não será reconhecido.',
  email:     'Confirme que esse e-mail está cadastrado como chave PIX no banco de quem vai receber — senão o pagamento não será reconhecido.',
  telefone:  'Confirme que esse telefone está cadastrado como chave PIX no banco de quem vai receber — senão o pagamento não será reconhecido.',
  aleatoria: 'Confirme que essa chave aleatória está cadastrada como chave PIX no banco de quem vai receber — senão o pagamento não será reconhecido.',
};

// ── Resumo do Copia-e-Cola (Valor, Chave, Para, Cidade) ──────────────────
// Aparece em real-time quando user cola um Copia-e-Cola válido — antes mesmo
// de clicar Gerar — pra ele confirmar valor/destinatário sem ter que decifrar
// o payload TLV cru.
const ccSummary  = document.getElementById('cc-summary');
const ccRowKind  = document.getElementById('cc-row-kind');
const ccKind     = document.getElementById('cc-kind');
const ccRowValor = document.getElementById('cc-row-valor');
const ccRowPsp   = document.getElementById('cc-row-psp');
const ccPsp      = document.getElementById('cc-psp');
const ccRowRecurrence = document.getElementById('cc-row-recurrence');
const ccRecurrence = document.getElementById('cc-recurrence');
const ccRowChave = document.getElementById('cc-row-chave');
const ccRowNome  = document.getElementById('cc-row-nome');
const ccRowCidade = document.getElementById('cc-row-cidade');
const ccValor    = document.getElementById('cc-valor');
const ccChave    = document.getElementById('cc-chave');
const ccNome     = document.getElementById('cc-nome');
const ccCidade   = document.getElementById('cc-cidade');
const ccAddValor      = document.getElementById('cc-add-valor');
const ccAddValorInput = document.getElementById('cc-add-valor-input');

// Formata "100.00" → "R$ 100,00", "5.5" → "R$ 5,50", "" → ''
function formatValorBRL(v) {
  if (!/^\d{1,10}\.\d{2}$/.test(v || '')) return '';
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '';
  return 'R$ ' + n.toFixed(2).replace('.', ',');
}

// Extrai o HOST do location (campo 26.25) de um QR Dinâmico:
// "pix.exemplo.invalid/qr/v2/..." → "pix.exemplo.invalid". É o domínio do PSP
// que vai RESOLVER o valor real no app do banco — exibi-lo é um sinal de confiança
// (o usuário vê se é o banco esperado ou um domínio estranho). O caller usa
// textContent (sem injeção). Inline aqui (não no pix-core) pra não criar um símbolo
// cross-file novo — sob skew de versão do SWR isso viraria ReferenceError.
// Retorna '' se não der pra parsear (mostra nada em vez de algo errado).
function pspHost(location) {
  if (!location) return '';
  try {
    return new URL(location.includes('://') ? location : 'https://' + location).host;
  } catch (e) {
    return '';
  }
}

// Guarda o último payload válido parseado pra reconstruir no Gerar
// se o user adicionou um valor opcional.
let lastParsedCopiaCola = null;
let lastCopiaColaSource = '';

function renderCopiaColaSummary(payload) {
  if (payload !== lastCopiaColaSource) ccAddValorInput.value = '';
  lastCopiaColaSource = payload;
  const parsed = parseCopiaCola(payload);
  lastParsedCopiaCola = parsed;
  if (!parsed) { ccSummary.hidden = true; ccAddValor.hidden = true; return; }

  if (parsed.isComposto) {
    ccKind.textContent = parsed.paymentType === 'none'
      ? 'Pix Automático — somente recorrência'
      : `Pix Automático + pagamento ${parsed.paymentType === 'dynamic' ? 'dinâmico' : 'estático'}`;
    modeLabelEl.textContent = 'Pix Automático';
  } else {
    ccKind.textContent = parsed.isDinamico ? 'Pagamento dinâmico' : 'Pagamento estático';
  }
  ccRowKind.hidden = false;

  // Valor: QR Dinâmico tem PRIORIDADE sobre o campo 54 embutido — checar
  // isDinamico ANTES do valor é o cerne do fix. O campo 54 de um QR dinâmico pode
  // ser um placeholder observado em integrações de campo;
  // o valor real é resolvido pelo PSP no app do banco no momento do pagamento.
  // Exibi-lo como "R$ 1,00" verde mostrava um número ERRADO com cara de confiável
  // (o bug). Em dinâmico explicitamos isso em vez de esconder a linha (que confunde
  // "será que não vai cobrar?"). O ternário zera o valor em dinâmico; formatValorBRL
  // ainda guarda contra campo 54 malformado em QR estático.
  const valorFmt = parsed.paymentType === 'static' ? formatValorBRL(parsed.valor) : '';
  if (valorFmt) {
    ccValor.textContent = valorFmt;
    ccValor.classList.add('cc-value-money');  // verde
    ccValor.classList.remove('cc-value-muted');
    ccRowValor.hidden = false;
  } else if (parsed.paymentType === 'dynamic') {
    ccValor.textContent = 'Definido pelo recebedor (QR dinâmico)';
    ccValor.classList.remove('cc-value-money');
    ccValor.classList.add('cc-value-muted');  // cinza, sinaliza "não é dinheiro fixo"
    ccRowValor.hidden = false;
  } else if (parsed.paymentType === 'none') {
    ccValor.textContent = 'Sem pagamento imediato — autorização de recorrência';
    ccValor.classList.remove('cc-value-money');
    ccValor.classList.add('cc-value-muted');
    ccRowValor.hidden = false;
  } else {
    ccRowValor.hidden = true;  // estático sem valor (ou campo 54 lixo) → esconde
  }

  // PSP: em QR Dinâmico, mostra o domínio que vai RESOLVER o valor real no app do
  // banco — sinal de confiança (é o banco/PSP esperado, ou um domínio estranho?).
  // Só aparece quando há location parseável; estático não tem location.
  const host = parsed.isDinamico ? pspHost(parsed.location) : '';
  if (host) {
    ccPsp.textContent = host;
    ccRowPsp.hidden = false;
  } else {
    ccRowPsp.hidden = true;
  }

  const recurrenceHost = parsed.isComposto ? pspHost(parsed.recurrenceLocation) : '';
  if (recurrenceHost) {
    ccRecurrence.textContent = recurrenceHost;
    ccRowRecurrence.hidden = false;
  } else {
    ccRowRecurrence.hidden = true;
  }

  // Em QR Dinâmico não há "chave" — só uma URL de location. Esconde a linha
  // pra não exibir URL técnica que não ajuda o usuário a confirmar.
  if (parsed.chave && !parsed.isDinamico) {
    ccChave.textContent = parsed.chave;
    ccRowChave.hidden = false;
  } else {
    ccRowChave.hidden = true;
  }

  if (parsed.nome)  { ccNome.textContent = parsed.nome;   ccRowNome.hidden = false; }
  else              { ccRowNome.hidden = true; }

  if (parsed.cidade) { ccCidade.textContent = parsed.cidade; ccRowCidade.hidden = false; }
  else               { ccRowCidade.hidden = true; }

  // Campo "Adicionar valor": só aparece em QR Estático sem valor embutido.
  // Dinâmico não permite editar (valor vem do server do PSP); com valor já
  // embutido não precisa adicionar.
  if (parsed.paymentType === 'static' && !parsed.valor) {
    ccAddValor.hidden = false;
  } else {
    ccAddValor.hidden = true;
    ccAddValorInput.value = '';
  }

  ccSummary.hidden = false;
}

function hideCopiaColaSummary() {
  ccSummary.hidden = true;
  ccAddValor.hidden = true;
  ccAddValorInput.value = '';
  lastParsedCopiaCola = null;
  lastCopiaColaSource = '';
}

// Funil de uso: tool-start marca a PRIMEIRA interação com a ferramenta na
// carga da página (digitar chave = 'type', abrir scanner = 'scan'). Uma vez
// só — o funil mede sessões que começaram, não quantidade de teclas. O data
// carrega apenas o modo enumerado; nunca conteúdo PIX.
let toolStartTracked = false;
function trackToolStart(mode) {
  if (toolStartTracked) return;
  toolStartTracked = true;
  if (window.umami) umami.track('tool-start', { mode });
}

chaveInput.addEventListener('input', () => {
  trackToolStart('type');
  const mode = detectMode(chaveInput.value);
  errorMsg.textContent = '';
  // O QR/payload exibido vira stale assim que a chave muda — invalida pra que
  // Copiar/Baixar nunca peguem o payload de uma chave anterior (força clicar
  // "Gerar" de novo). Guard em currentPayload: na reconstrução de Copia-e-Cola
  // o handler re-dispara 'input' antes de currentPayload ser setado, então isto
  // é inócuo lá (não apaga o QR que está sendo gerado).
  if (currentPayload) invalidateResult();
  if (!mode) {
    modeTagEl.classList.remove('visible');
    extraFields.classList.remove('visible');
    hideCopiaColaSummary();
    return;
  }
  modeTagEl.classList.add('visible');
  if (mode === 'copia-cola') {
    modeLabelEl.textContent = 'Copia e Cola';
    extraFields.classList.remove('visible');
    // Tenta renderizar o resumo; renderCopiaColaSummary esconde sozinho se inválido
    renderCopiaColaSummary(chaveInput.value.trim());
  } else {
    extraFields.classList.add('visible');
    hideCopiaColaSummary();
    // Real-time: mostra tipo detectado (CPF, E-mail, etc); fallback genérico senão.
    const parsed = parseChave(chaveInput.value);
    modeLabelEl.textContent = (parsed && TIPO_LABEL[parsed.tipo]) || 'Chave Simples';
  }
});

// Ao sair do campo: formata se válido, mostra erro se inválido.
chaveInput.addEventListener('blur', () => {
  const parsed = parseChave(chaveInput.value);
  if (showChaveErrorIfInvalid(parsed, chaveInput.value)) return;
  if (!parsed) return; // vazio
  if (parsed.tipo === 'copia-cola') return;
  if (parsed.display !== chaveInput.value) {
    chaveInput.value = parsed.display;
  }
});

// ── Decodificar QR (caminho inverso: imagem → chave/Copia-e-Cola) ────────
// Usa jsQR (self-hosted, Apache-2.0). Fluxo: file input → image → canvas → jsQR
// → fill chave-input → reaproveita toda a validação existente.
const scanQrBtn   = document.getElementById('scan-qr-btn');
const qrFileInput = document.getElementById('qr-file-input');

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagem inválida')); };
    img.src = url;
  });
}

scanQrBtn.addEventListener('click', () => {
  trackToolStart('scan');
  qrFileInput.click();
});

qrFileInput.addEventListener('change', async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  errorMsg.textContent = '';
  invalidateResult();
  hideCopiaColaSummary();
  if ((file.type && !file.type.startsWith('image/')) || file.size > 15 * 1024 * 1024) {
    errorMsg.textContent = 'Selecione uma imagem de até 15 MB.';
    qrFileInput.value = '';
    return;
  }
  // Um scan começa do zero: zera Nome/Cidade/Valor antes de injetar a chave.
  // Sem isso, escanear um QR de chave NUA (não Copia-e-Cola) reaproveita o ramo
  // "chave" — que esconde o resumo e NÃO toca esses campos — e o auto-Gerar
  // embutiria um valor/nome STALE de uma operação anterior, cobrando um valor
  // que o usuário não pediu do destinatário recém-escaneado (wrong-payment
  // silencioso). Em Copia-e-Cola esses campos ficam ocultos, então limpar é inócuo.
  nomeInput.value = '';
  cidadeInput.value = '';
  valorInput.value = '';
  nomeInput.dispatchEvent(new Event('input', { bubbles: true }));    // reavalia o aviso de dígito
  cidadeInput.dispatchEvent(new Event('input', { bubbles: true }));
  scanQrBtn.disabled = true;
  try {
    if (typeof jsQR !== 'function') {
      errorMsg.textContent = 'Decoder de QR não carregou. Recarregue a página.';
      return;
    }
    // Lê no máximo 1 MiB do cabeçalho e rejeita dimensão excessiva ANTES de
    // criar Image/ObjectURL. Assim PNG/JPEG/GIF/WebP declarando uma superfície
    // de centenas de milhões de pixels não chegam ao decoder integral do browser.
    const header = await file.slice(0, Math.min(file.size, 1024 * 1024)).arrayBuffer();
    const imageInfo = readImageDimensions(header);
    if (!imageInfo) {
      errorMsg.textContent = 'Formato não suportado. Use PNG, JPEG, GIF ou WebP.';
      return;
    }
    if (!hasSafeImageDimensions(imageInfo)) {
      errorMsg.textContent = 'Imagem grande demais para processar com segurança (máximo de 25 megapixels).';
      return;
    }
    const img = await loadImageFile(file);
    const srcW = img.naturalWidth;
    const srcH = img.naturalHeight;
    if (!srcW || !srcH) {
      errorMsg.textContent = 'Imagem com dimensão zero.';
      return;
    }
    if (!hasSafeImageDimensions({ width: srcW, height: srcH })) {
      errorMsg.textContent = 'Imagem grande demais para processar com segurança (máximo de 25 megapixels).';
      return;
    }
    if (!hasConsistentDecodedImageDimensions(imageInfo, srcW, srcH)) {
      errorMsg.textContent = 'A dimensão decodificada não corresponde ao cabeçalho da imagem.';
      return;
    }
    // Clamp: limita o maior lado a MAX_QR_DECODE_SIDE e faz downscale proporcional
    // no próprio drawImage. Sem isso, getImageData materializaria um buffer w*h*4 —
    // uma imagem enorme (ex.: 30000x30000 ≈ 3,6 GB) travaria/derrubaria a aba.
    // jsQR lê bem em cópia reduzida, então não há perda prática de leitura.
    const MAX_QR_DECODE_SIDE = 2000;
    const scale = Math.min(1, MAX_QR_DECODE_SIDE / Math.max(srcW, srcH));
    const canvas = document.createElement('canvas');
    canvas.width  = Math.max(1, Math.round(srcW * scale));
    canvas.height = Math.max(1, Math.round(srcH * scale));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' });
    if (!code || !code.data) {
      errorMsg.textContent = 'Não consegui ler um QR Code nessa imagem. Tente foto mais nítida ou enquadrada.';
      invalidateResult();
      return;
    }
    // Coloca o conteúdo decodificado no input e dispara o fluxo padrão.
    // A validação existente cuida do resto: copia-cola valido → mode-pill,
    // chave válida → formatação no blur, lixo → erro específico.
    chaveInput.value = code.data;
    chaveInput.dispatchEvent(new Event('input', { bubbles: true }));
    chaveInput.dispatchEvent(new Event('blur', { bubbles: true }));

    // Caminho inverso completo: ao decodificar QR válido, auto-clica Gerar
    // pra renderizar o QR + Copia-e-Cola + tip-jar imediatamente. Se a
    // validação detectar lixo (não-PIX, ambíguo, etc), o handler do Gerar
    // mostra o erro específico — fluxo único pra tudo.
    gerarBtn.click();

    if (window.umami) {
      umami.track('qr-decoded', {
        kind: code.data.startsWith('000201') ? 'pix' : 'other',
      });
    }
  } catch (err) {
    errorMsg.textContent = 'Erro ao processar imagem: ' + (err && err.message || err);
    invalidateResult();
  } finally {
    qrFileInput.value = ''; // permite re-selecionar o mesmo arquivo
    scanQrBtn.disabled = false;
  }
});

// Soft warning em Nome/Cidade: PIX Merchant Name/City não deveria ter dígitos.
// Não bloqueia — só alerta. normalizeText já strip-a tudo fora de ASCII imprimível.
function bindDigitWarning(inputEl, warnEl) {
  const check = () => { warnEl.hidden = !/\d/.test(inputEl.value); };
  inputEl.addEventListener('input', check);
  check();
}
bindDigitWarning(nomeInput,   document.getElementById('nome-warn'));
bindDigitWarning(cidadeInput, document.getElementById('cidade-warn'));

// Valor: aceita "," e ".", exibe BR ao sair do campo, internamente vira "." no
// payload. Entrada inválida permanece visível: apagá-la aqui faria o Gerar
// interpretar a intenção como QR de valor aberto.
valorInput.addEventListener('input', () => valorInput.removeAttribute('aria-invalid'));
valorInput.addEventListener('blur', () => {
  const formatted = formatarValorBR(valorInput.value);
  if (formatted) {
    valorInput.value = formatted;
    valorInput.removeAttribute('aria-invalid');
  } else if (valorInput.value.trim()) {
    valorInput.setAttribute('aria-invalid', 'true');
  } else {
    valorInput.removeAttribute('aria-invalid');
  }
});

// Mudar Nome/Cidade/Valor ou o valor adicional após gerar também deixa o QR
// exibido obsoleto — invalida pelo mesmo motivo do handler da chave acima. A
// chave já é tratada no seu próprio handler de input.
[nomeInput, cidadeInput, valorInput, ccAddValorInput].forEach((el) => {
  el.addEventListener('input', () => { if (currentPayload) invalidateResult(); });
});

// Mensagem única p/ valor digitado mas inválido (usada nos dois caminhos de
// geração — Copia-e-Cola com valor adicional e chave com valor).
const VALOR_INVALIDO_MSG = 'Valor inválido. Use o formato 1.234,56.';

gerarBtn.addEventListener('click', () => {
  errorMsg.textContent = '';
  invalidateResult(); // reseta QR/payload antigo — só o sucesso repopula
  const raw = chaveInput.value.trim();
  if (!raw) {
    errorMsg.textContent = 'Informe uma chave PIX ou código Copia e Cola.';
    return;
  }
  // Bloqueia geração se input é inválido; mostra erro específico.
  const parsedCheck = parseChave(raw);
  if (showChaveErrorIfInvalid(parsedCheck, raw)) return;
  const mode = detectMode(raw);
  let payload;
  try {
    if (mode === 'copia-cola') {
      payload = raw;
      // Se o user adicionou valor a um Copia-e-Cola Estático sem montante,
      // inserimos somente tag 54 e CRC; todos os demais TLVs ficam intactos.
      const addValor = ccAddValorInput.value.trim();
      if (addValor && lastParsedCopiaCola && lastParsedCopiaCola.paymentType === 'static'
                   && !lastParsedCopiaCola.valor) {
        // Valor digitado mas inválido → erro explícito, não gera QR de valor
        // em aberto silenciosamente (o usuário claramente quis um valor).
        if (!normalizeValorParaPayload(addValor)) {
          invalidateResult();
          errorMsg.textContent = VALOR_INVALIDO_MSG;
          return;
        }
        payload = withStaticAmount(raw, addValor);
        // Reflete o novo payload no input pra usuário poder copiá-lo
        chaveInput.value = payload;
        chaveInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } else {
      // Valor digitado mas inválido → erro explícito, não gera QR de valor em
      // aberto silenciosamente.
      const valorRaw = valorInput.value.trim();
      if (valorRaw && !normalizeValorParaPayload(valorRaw)) {
        invalidateResult();
        errorMsg.textContent = VALOR_INVALIDO_MSG;
        return;
      }
      payload = generatePayload(raw, nomeInput.value, cidadeInput.value, valorInput.value);
    }
  } catch (e) {
    errorMsg.textContent = 'Erro ao gerar payload: ' + e.message;
    return;
  }
  currentPayload = payload;
  payloadDisplay.textContent = payload;
  // qrWrap já foi limpo por invalidateResult() no início do handler.
  // node-qrcode renderiza num <canvas> que criamos e anexamos ao qrWrap;
  // baixarQRAtual lê esse canvas via composedPngDataURL. O callback do
  // toCanvas roda de forma síncrona (node-qrcode chama cb na mesma stack).
  const qrCanvas = document.createElement('canvas');
  // Canvas não tem alt nativo: expõe como imagem nomeada pro leitor de tela
  // (o Copia-e-Cola em texto é a alternativa acessível ao conteúdo em si).
  qrCanvas.setAttribute('role', 'img');
  qrCanvas.setAttribute('aria-label', 'QR Code PIX gerado — escaneie no app do banco');
  let qrModuleCount;
  try {
    // Mantém um número inteiro de pixels por módulo. Um canvas fixo de 320px
    // chega a menos de 2px/módulo perto do limite BR Code de 1024 bytes e pode
    // produzir um QR correto, mas impossível de reler com segurança.
    qrModuleCount = QRCode.create(payload, { errorCorrectionLevel: 'H' }).modules.size;
  } catch (e) {
    invalidateResult();
    errorMsg.textContent = 'Erro ao gerar QR Code: ' + (e.message || e);
    return;
  }
  const pixelsPerModule = Math.max(4, Math.ceil(320 / qrModuleCount));
  const qrRenderSize = qrModuleCount * pixelsPerModule;
  qrCanvas.dataset.qrModules = String(qrModuleCount);
  QRCode.toCanvas(qrCanvas, payload, {
    // ECC H (30% recovery) — recomendado pelo BCB pra PIX. QR financeiro
    // costuma ser impresso, dobrado, screenshot-ado. ECC H decodifica
    // mesmo com até 30% de área danificada. Padrão dos apps de banco.
    errorCorrectionLevel: 'H',
    // Pelo menos 4 pixels inteiros por módulo; QRs comuns ficam em ~320px e
    // payloads densos crescem só o necessário. O CSS limita o tamanho visual.
    width: qrRenderSize,
    // Sem quiet zone no canvas — ela é adicionada só no PNG baixado
    // (composedPngDataURL). On-screen, o .qr-container já dá a moldura branca.
    margin: 0,
    color: { dark: '#000000', light: '#ffffff' },
  }, (err) => {
    if (err) {
      // node-qrcode só falha se o payload exceder a capacidade física do
      // maior QR (v40) — irreal pra PIX. Tratamos com clareza mesmo assim.
      invalidateResult();
      errorMsg.textContent = 'Erro ao gerar QR Code: ' + (err.message || err);
      return;
    }
    // node-qrcode escreve style.width/height inline (px fixo) no canvas, o que
    // sobreporia o CSS responsivo (#qr-wrap canvas { width:100%; max-width:280px }).
    // Limpamos pra deixar o CSS controlar o tamanho de exibição.
    qrCanvas.style.removeProperty('width');
    qrCanvas.style.removeProperty('height');
    // Auto-verifica que o QR escaneia de volta pro payload ANTES de exibi-lo.
    if (!qrDecodificaPara(qrCanvas, payload)) {
      invalidateResult();
      errorMsg.textContent = 'Falha ao verificar o QR gerado. Não use este código — tente novamente.';
      return;
    }
    qrWrap.appendChild(qrCanvas);
    // Aviso de chave-cadastrada: só pra QR gerado de CHAVE (parsedCheck.tipo é um
    // tipo de chave). Em Copia-e-Cola, parsedCheck.tipo='copia-cola' → KEY_HINT
    // indefinido → escondido (a chave já está registrada no PSP que o emitiu).
    const hintMsg = KEY_HINT[parsedCheck && parsedCheck.tipo];
    keyHint.textContent = hintMsg || '';
    keyHint.hidden = !hintMsg;
    resultEl.classList.add('visible');
    // Move o foco pro cabeçalho do resultado: leitores de tela anunciam
    // "QR Code gerado" e o teclado segue daqui pros botões Copiar/Baixar.
    // preventScroll evita pulo brusco — o scroll suave fica com o scrollIntoView abaixo.
    resultHeader.focus({ preventScroll: true });
    setTimeout(() => resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
    if (window.umami) umami.track('qr-generated', { mode });
  });
});

copyBtn.addEventListener('click', () => {
  if (!currentPayload) return;
  navigator.clipboard.writeText(currentPayload).then(() => {
    if (window.umami) umami.track('payload-copied');
    const original = copyBtn.innerHTML;
    copyBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg> Copiado!`;
    copyBtn.classList.add('success');
    setTimeout(() => {
      copyBtn.innerHTML = original;
      copyBtn.classList.remove('success');
    }, 2000);
  }).catch(() => {
    errorMsg.textContent = 'Não foi possível copiar. Selecione o texto manualmente.';
  });
});

// Nome do arquivo: prefixo "pix2qr" (brand do site) + data ISO ordenável
// + hora em formato BR ("14h30", como em extratos de banco). Sem segundos —
// se gerar 2 QRs no mesmo minuto, o browser adiciona "(1)" automaticamente.
function qrFilename() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hm  = `${pad(d.getHours())}h${pad(d.getMinutes())}`;
  return `pix2qr-${ymd}-${hm}.png`;
}

// Compõe o PNG final pra download a partir do canvas do QR:
//   - Adiciona quiet zone branca de exatamente 4 módulos de cada lado.
//   - Re-renderiza com pixels inteiros por módulo e lado ≥600px, sem deformar
//     nem os QRs pequenos nem um QR denso no limite BR Code de 1024 bytes.
//   - imageSmoothingEnabled = false preserva pixels afiados (sem blur).
// Compõe o canvas final (quiet zone + upscale) — usado pelo download PNG E pelo
// "copiar imagem". Mantido como canvas (não dataURL) pra o copiar usar toBlob
// direto; fetch('data:...') seria bloqueado pela CSP connect-src.
function composedCanvas(srcCanvas) {
  const moduleCount = Number.parseInt(srcCanvas.dataset.qrModules || '', 10);
  const hasModuleCount = Number.isInteger(moduleCount) && moduleCount > 0;
  const targetPixelsPerModule = hasModuleCount
    ? Math.max(4, Math.ceil(600 / moduleCount))
    : 1;
  const TARGET_QR = hasModuleCount ? moduleCount * targetPixelsPerModule : 600;
  const QUIET_ZONE = hasModuleCount ? 4 * targetPixelsPerModule : 40;
  const total = TARGET_QR + (QUIET_ZONE * 2);

  const canvas = document.createElement('canvas');
  canvas.width = total;
  canvas.height = total;
  const ctx = canvas.getContext('2d');
  // Fundo branco sólido (não transparente — PNG com transparência confunde
  // câmera + alguns apps de mensagem colocam fundo escuro atrás).
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, total, total);
  // Nearest-neighbor pra QR ficar afiado em qualquer escala
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(srcCanvas, QUIET_ZONE, QUIET_ZONE, TARGET_QR, TARGET_QR);
  return canvas;
}

function composedPngDataURL(srcCanvas) {
  return composedCanvas(srcCanvas).toDataURL('image/png');
}

// Auto-verificação (defesa em profundidade, app de pagamento): lê de volta o QR
// gerado — upscale + quiet zone generosa — e decodifica com jsQR pra confirmar
// que escaneia EXATAMENTE pro payload. Pega bug de ENCODING (foi como a lib
// antiga falhava: QR corrompido/ilegível pra um payload correto). Render
// pristine → jsQR é determinístico. Falha de verificação também bloqueia: num
// caminho de pagamento, lib ausente/exceção não pode ser interpretada como OK.
function qrDecodificaPara(srcCanvas, esperado) {
  try {
    if (typeof jsQR !== 'function') return false;
    const scale = Math.max(2, Math.ceil(800 / srcCanvas.width));
    const qz = Math.round(srcCanvas.width * scale * 0.1);
    const W = srcCanvas.width * scale + qz * 2;
    const H = srcCanvas.height * scale + qz * 2;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(srcCanvas, qz, qz, srcCanvas.width * scale, srcCanvas.height * scale);
    const { data } = ctx.getImageData(0, 0, W, H);
    const code = jsQR(data, W, H, { inversionAttempts: 'dontInvert' });
    return !!code && code.data === esperado;
  } catch (_) {
    return false;
  }
}

function baixarQRAtual(source) {
  // node-qrcode sempre renderiza num <canvas> (nunca <img>), então basta lê-lo.
  const canvas = qrWrap.querySelector('canvas');
  if (!canvas) {
    errorMsg.textContent = 'Gere o QR Code antes de baixar.';
    return;
  }
  const link = document.createElement('a');
  link.download = qrFilename();
  // Compõe com quiet zone + upscale antes de baixar
  link.href = composedPngDataURL(canvas);
  link.click();
  if (window.umami) umami.track('qr-downloaded', { source });
}

downloadBtn.addEventListener('click', () => baixarQRAtual('button'));

// Baixar SVG (vetor): nítido em qualquer escala — ideal pra impressão. O
// node-qrcode gera o SVG via toString; quiet zone (margin 4) embutida no arquivo.
function baixarSVG() {
  if (!currentPayload) { errorMsg.textContent = 'Gere o QR Code antes de baixar.'; return; }
  QRCode.toString(currentPayload, {
    type: 'svg', errorCorrectionLevel: 'H', margin: 4,
    color: { dark: '#000000', light: '#ffffff' },
  }, (err, svg) => {
    if (err) { errorMsg.textContent = 'Erro ao gerar SVG: ' + (err.message || err); return; }
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = qrFilename().replace(/\.png$/, '.svg');
    link.click();
    URL.revokeObjectURL(url);
    if (window.umami) umami.track('qr-downloaded', { source: 'svg' });
  });
}
downloadSvgBtn.addEventListener('click', baixarSVG);

// Copiar a imagem do QR pro clipboard (mesmo PNG composto do download), pra
// colar direto no WhatsApp/doc sem baixar arquivo.
function copiarImagem() {
  const canvas = qrWrap.querySelector('canvas');
  if (!canvas) { errorMsg.textContent = 'Gere o QR Code antes de copiar.'; return; }
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
    errorMsg.textContent = 'Seu navegador não suporta copiar imagem. Use "Baixar PNG".';
    return;
  }
  composedCanvas(canvas).toBlob((blob) => {
    if (!blob) { errorMsg.textContent = 'Não foi possível gerar a imagem.'; return; }
    navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(() => {
      if (window.umami) umami.track('qr-image-copied');
      const original = copyImgBtn.innerHTML;
      copyImgBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg> Copiada!`;
      copyImgBtn.classList.add('success');
      setTimeout(() => { copyImgBtn.innerHTML = original; copyImgBtn.classList.remove('success'); }, 2000);
    }).catch(() => {
      errorMsg.textContent = 'Não foi possível copiar a imagem. Use "Baixar PNG".';
    });
  }, 'image/png');
}
copyImgBtn.addEventListener('click', copiarImagem);

qrContainer.addEventListener('click', () => {
  if (!currentPayload) return;
  baixarQRAtual('qr-click');
});

qrContainer.addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && currentPayload) {
    event.preventDefault();
    baixarQRAtual('qr-keyboard');
  }
});

const donateToggle = document.getElementById('donate-toggle');
const donatePanel  = document.getElementById('donate-panel');

donateToggle.addEventListener('click', () => {
  const open = donatePanel.classList.toggle('open');
  // Espelha o estado pro leitor de tela (aria-expanded) e tira o painel
  // colapsado da ordem de tabulação / árvore de acessibilidade (inert),
  // pra que os botões "Copiar" não sejam focáveis quando escondido.
  donateToggle.setAttribute('aria-expanded', String(open));
  donatePanel.inert = !open;
  if (window.umami) umami.track('donate-toggle');
});

document.querySelectorAll('.donate-copy').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    const text = document.getElementById(targetId).textContent.trim();
    navigator.clipboard.writeText(text).then(() => {
      if (window.umami) umami.track('donate-copy', { target: targetId });
      const orig = btn.textContent;
      btn.textContent = 'Copiado!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = orig;
        btn.classList.remove('copied');
      }, 2000);
    }).catch(() => {
      btn.textContent = 'Erro';
      setTimeout(() => { btn.textContent = 'Copiar'; }, 2000);
    });
  });
});

// ── Conectividade ─────────────────────────────────────────────────────────
const offlineChip = document.getElementById('offline-chip');
function updateConnectivityUI() { offlineChip.hidden = navigator.onLine; }
window.addEventListener('online', updateConnectivityUI);
window.addEventListener('offline', updateConnectivityUI);
updateConnectivityUI();

// ── Instalação PWA ────────────────────────────────────────────────────────
const installBtn = document.getElementById('install-btn');
let deferredInstallPrompt = null;

// Textos de instrução por plataforma.
// Usa marcador **texto** para negrito — renderizado via DOM (sem innerHTML).
const INSTALL_INFO = {
  ios: {
    title: 'Instalar no iPhone / iPad',
    desc: 'No Safari, siga os passos:',
    steps: [
      'Toque no ícone **Compartilhar (□↑)** na barra inferior',
      'Role e toque em **Adicionar à Tela de Início**',
      'Toque em **Adicionar** no canto superior direito',
    ],
  },
  android: {
    title: 'Instalar no Android',
    desc: 'No Chrome, siga os passos:',
    steps: [
      'Toque em **⋮** (menu) no canto superior direito',
      'Toque em **Instalar app** ou **Adicionar à tela inicial**',
      'Confirme tocando em **Instalar**',
    ],
  },
  'safari-mac': {
    title: 'Instalar no Mac (Safari)',
    desc: 'No Safari 17+ (macOS Sonoma ou mais recente):',
    steps: [
      'Abra o menu **Arquivo** na barra de menus',
      'Clique em **Adicionar ao Dock…**',
      'Clique em **Adicionar**',
    ],
  },
  firefox: {
    title: 'Salvar nos favoritos',
    desc: 'O Firefox não suporta instalação de PWA. Salve nos favoritos:',
    steps: [
      'Pressione **Ctrl+D** (Windows/Linux) ou **⌘D** (Mac)',
      'Escolha a pasta e clique em **Salvar**',
    ],
  },
  other: {
    title: 'Instalar ou salvar',
    desc: 'Adicione este app à sua tela inicial ou favoritos:',
    steps: [
      'Abra o menu do navegador (⋮ ou ☰)',
      'Procure por **Instalar app** ou **Adicionar à tela inicial**',
      'Se não encontrar, pressione **Ctrl+D** / **⌘D** para favoritar',
    ],
  },
};

/** Cria nós de texto/strong a partir de "texto **negrito** texto" — sem innerHTML. */
function appendBoldText(parent, str) {
  str.split(/\*\*(.*?)\*\*/).forEach((part, i) => {
    if (!part) return;
    if (i % 2 === 1) {
      const s = document.createElement('strong');
      s.textContent = part;
      parent.appendChild(s);
    } else {
      parent.appendChild(document.createTextNode(part));
    }
  });
}

function detectPlatform() {
  const ua = navigator.userAgent;
  // iPadOS 13+ envia UA "Macintosh" no modo desktop — detecta via touch points
  const isIPadOS = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  if (/iphone|ipad|ipod/i.test(ua) || isIPadOS) return 'ios';
  if (/android/i.test(ua)) return 'android';
  if (/Macintosh/i.test(ua) && /Safari/.test(ua) && !/Chrome/.test(ua) && !/Chromium/.test(ua)) return 'safari-mac';
  if (/Firefox/i.test(ua)) return 'firefox';
  return 'other';
}

// Estado do modal.
// NOTA: o div#install-modal é parseado depois deste arquivo, então os
// lookups precisam ser lazy (no DOMContentLoaded ou no momento do uso).
let lastFocusedBeforeModal = null;

// Helper: pega elementos do modal sob demanda (após DOM completo).
function getModalEls() {
  return {
    root:  document.getElementById('install-modal'),
    title: document.getElementById('install-modal-title'),
    desc:  document.getElementById('install-modal-desc'),
    ol:    document.getElementById('install-modal-steps'),
    close: document.getElementById('install-modal-close'),
    page:  document.querySelector('.page'),
  };
}

function openInstallModal(platform) {
  const info = INSTALL_INFO[platform] || INSTALL_INFO.other;
  const els = getModalEls();
  if (!els.root) return;
  els.title.textContent = info.title;
  els.desc.textContent = info.desc;
  els.ol.replaceChildren();
  for (const step of info.steps) {
    const li = document.createElement('li');
    appendBoldText(li, step);
    els.ol.appendChild(li);
  }
  lastFocusedBeforeModal = document.activeElement;
  els.root.classList.add('open');
  // inert no conteúdo de fundo — screen readers ignoram, Tab não alcança
  if (els.page && 'inert' in els.page) els.page.inert = true;
  // foca o botão "Entendi" (único focável dentro do modal)
  els.close.focus();
}

function closeInstallModal() {
  const els = getModalEls();
  if (!els.root) return;
  els.root.classList.remove('open');
  if (els.page && 'inert' in els.page) els.page.inert = false;
  if (lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === 'function') {
    lastFocusedBeforeModal.focus();
  }
  lastFocusedBeforeModal = null;
}

// Registra listeners do modal depois do DOM pronto (ou imediatamente se já estiver).
function wireInstallModal() {
  const els = getModalEls();
  if (!els.root || !els.close) return;
  // Backdrop
  els.root.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeInstallModal();
  });
  // Botão "Entendi" (sem onclick inline → compatível com CSP estrita)
  els.close.addEventListener('click', closeInstallModal);
  // Escape + focus trap (Tab cíclico)
  document.addEventListener('keydown', (e) => {
    if (!els.root.classList.contains('open')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeInstallModal();
      return;
    }
    if (e.key === 'Tab') {
      // Único focável no modal → trava nele
      e.preventDefault();
      els.close.focus();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireInstallModal);
} else {
  wireInstallModal();
}

const isStandalone = window.matchMedia('(display-mode: standalone)').matches
  || navigator.standalone === true;

if (!isStandalone) {
  const platform = detectPlatform();

  // Chromium: prompt nativo via beforeinstallprompt
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installBtn.hidden = false;
  });

  // iOS, Safari Mac e Firefox nunca disparam beforeinstallprompt — mostra botão direto
  if (platform === 'ios' || platform === 'safari-mac' || platform === 'firefox') {
    installBtn.hidden = false;
  }

  installBtn.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      // Chromium: prompt nativo — evento só pode ser usado 1x, zera sempre
      const promptEvent = deferredInstallPrompt;
      deferredInstallPrompt = null;
      promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === 'accepted') {
        installBtn.hidden = true;
        if (window.umami) umami.track('pwa-installed');
      }
      // Se dismissed: próximo clique cai no modal fallback (já que zeramos o prompt)
    } else {
      // Fallback: modal com instruções manuais
      openInstallModal(platform);
      if (window.umami) umami.track('pwa-install-modal', { platform });
    }
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    installBtn.hidden = true;
    if (window.umami) umami.track('pwa-installed');
  });
}

if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', async () => {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let controllerSeen = navigator.serviceWorker.controller;
    let reloadStarted = false;

    // Um controller novo só assume após baixar e validar o shell inteiro. A aba
    // recarrega exatamente uma vez para não manter HTML/JS v1 rodando sobre
    // cache v2. Na primeira instalação não havia controller: o primeiro
    // clients.claim() apenas arma esta aba para mudanças futuras, sem apagar
    // estado recém-preenchido. O listener permanece vivo depois desse claim.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!controllerSeen) {
        controllerSeen = navigator.serviceWorker.controller;
        return;
      }
      if (reloadStarted) return;
      reloadStarted = true;
      window.location.reload();
    });

    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        updateViaCache: 'none',
      });
      // Em uma aba já controlada, força a busca de correções sem abortar uma
      // instalação que o próprio register() acabou de iniciar. Na primeira
      // visita, a instalação inicial segue sozinha até clients.claim().
      if (hadController && !registration.installing) {
        await registration.update();
      }
    } catch (_) {
      // Falha silenciosa para nao quebrar o fluxo principal do app.
    }
  });
}
