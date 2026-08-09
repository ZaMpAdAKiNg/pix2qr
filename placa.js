/* Página /qr-code-pix-para-imprimir: monta a placa PIX imprimível a partir do
 * MESMO core de payload da home (pix-core.js) e desenha tudo em canvas local.
 * Nenhum dado de pagamento sai do navegador; a telemetria carrega apenas o
 * modo/preset enumerado (ver test/placa-page.test.js). */

const chaveInput  = document.getElementById('chave-input');
const nomeInput   = document.getElementById('nome-input');
const cidadeInput = document.getElementById('cidade-input');
const valorInput  = document.getElementById('valor-input');
const gerarBtn    = document.getElementById('gerar-btn');
const errorMsg    = document.getElementById('error-msg');
const previewWrap = document.getElementById('preview-wrap');
const previewEl   = document.getElementById('placa-preview');
const printBtn    = document.getElementById('print-btn');
const downloadBtn = document.getElementById('download-btn');
const printArea   = document.getElementById('print-area');

// 150 dpi em pixels: suficiente pra impressão doméstica nítida sem estourar
// memória de canvas em celular (A4 300 dpi = 8,7 MP só de bitmap).
const PRESETS = {
  a4:     { width: 1240, height: 1754, label: 'A4' },
  a5:     { width: 874,  height: 1240, label: 'A5' },
  balcao: { width: 591,  height: 886,  label: '10×15 cm' },
};

let placaCanvas = null;

// Funil de uso: primeira interação da carga de página, uma vez só, modo
// enumerado — espelha o tool-start da home (mesmo contrato de privacidade).
let toolStartTracked = false;
function trackToolStart() {
  if (toolStartTracked) return;
  toolStartTracked = true;
  if (window.umami) umami.track('tool-start', { mode: 'type' });
}

function selectedPreset() {
  const checked = document.querySelector('input[name="preset"]:checked');
  return checked ? checked.value : 'a4';
}

function invalidatePreview() {
  placaCanvas = null;
  previewEl.textContent = '';
  printArea.textContent = '';
  previewWrap.hidden = true;
}

for (const input of [chaveInput, nomeInput, cidadeInput, valorInput]) {
  input.addEventListener('input', () => {
    trackToolStart();
    errorMsg.textContent = '';
    // Placa exibida vira stale quando qualquer dado muda: força re-gerar pra
    // que Imprimir/Baixar nunca peguem a placa de dados anteriores.
    if (placaCanvas) invalidatePreview();
  });
}
for (const radio of document.querySelectorAll('input[name="preset"]')) {
  radio.addEventListener('change', () => { if (placaCanvas) invalidatePreview(); });
}

function drawPlaca(payload, preset) {
  const spec = PRESETS[preset];
  const canvas = document.createElement('canvas');
  canvas.width = spec.width;
  canvas.height = spec.height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, spec.width, spec.height);

  const centerX = spec.width / 2;
  const titleSize = Math.round(spec.width * 0.072);
  ctx.fillStyle = '#111111';
  ctx.textAlign = 'center';
  ctx.font = `700 ${titleSize}px system-ui, sans-serif`;
  ctx.fillText('PAGUE COM PIX', centerX, spec.height * 0.11);

  return new Promise((resolve, reject) => {
    // margin: 4 módulos = zona de silêncio padrão EMV; o QR chega pronto pra
    // impressão sem depender de moldura externa.
    const qrSize = Math.round(spec.width * 0.66);
    const qrCanvas = document.createElement('canvas');
    QRCode.toCanvas(qrCanvas, payload, {
      width: qrSize,
      margin: 4,
      color: { dark: '#000000', light: '#ffffff' },
    }, (err) => {
      if (err) { reject(err); return; }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(qrCanvas, centerX - qrSize / 2, spec.height * 0.16, qrSize, qrSize);

      let cursorY = spec.height * 0.16 + qrSize + spec.height * 0.055;
      const nome = nomeInput.value.trim();
      if (nome) {
        ctx.font = `700 ${Math.round(spec.width * 0.05)}px system-ui, sans-serif`;
        ctx.fillText(nome.toUpperCase(), centerX, cursorY);
        cursorY += spec.height * 0.05;
      }
      const valorFmt = valorInput.value.trim() && typeof formatarValorBR === 'function'
        ? formatarValorBR(valorInput.value) : '';
      if (valorFmt) {
        ctx.font = `600 ${Math.round(spec.width * 0.044)}px system-ui, sans-serif`;
        ctx.fillText(`R$ ${valorFmt}`, centerX, cursorY);
        cursorY += spec.height * 0.05;
      }
      ctx.font = `400 ${Math.round(spec.width * 0.032)}px system-ui, sans-serif`;
      ctx.fillStyle = '#444444';
      ctx.fillText('Aponte a câmera do celular para pagar', centerX, cursorY);

      ctx.font = `400 ${Math.round(spec.width * 0.024)}px system-ui, sans-serif`;
      ctx.fillStyle = '#888888';
      ctx.fillText('QR PIX estático — confira o recebedor no app do banco', centerX, spec.height * 0.965);
      resolve(canvas);
    });
  });
}

gerarBtn.addEventListener('click', async () => {
  errorMsg.textContent = '';
  invalidatePreview();

  const raw = chaveInput.value.trim();
  if (!raw) { errorMsg.textContent = 'Informe a sua chave PIX.'; return; }
  if (typeof inspectCopiaCola === 'function' && inspectCopiaCola(raw)) {
    errorMsg.textContent = 'Isso é um PIX Copia e Cola. Para reimprimir um código existente, use o gerador da página inicial.';
    return;
  }
  if (typeof parseChave === 'function' && !parseChave(raw)) {
    errorMsg.textContent = 'Chave PIX inválida. Confira CPF/CNPJ, e-mail, telefone (+55…) ou chave aleatória.';
    return;
  }
  const valorRaw = valorInput.value.trim();
  if (valorRaw && !normalizeValorParaPayload(valorRaw)) {
    errorMsg.textContent = 'Valor inválido. Use o formato 12,34 ou deixe vazio.';
    return;
  }

  let payload;
  try {
    payload = generatePayload(raw, nomeInput.value, cidadeInput.value, valorInput.value);
  } catch (e) {
    errorMsg.textContent = 'Erro ao gerar payload: ' + e.message;
    return;
  }

  const preset = selectedPreset();
  try {
    placaCanvas = await drawPlaca(payload, preset);
  } catch (e) {
    errorMsg.textContent = 'Erro ao desenhar a placa: ' + (e.message || e);
    return;
  }
  previewEl.textContent = '';
  previewEl.appendChild(placaCanvas);
  previewWrap.hidden = false;
  previewWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (window.umami) umami.track('placa-preview', { preset });
});

printBtn.addEventListener('click', () => {
  if (!placaCanvas) return;
  // A área de impressão recebe uma CÓPIA rasterizada: o preview continua na
  // tela e o @media print isola só a placa.
  printArea.textContent = '';
  const copy = document.createElement('canvas');
  copy.width = placaCanvas.width;
  copy.height = placaCanvas.height;
  copy.getContext('2d').drawImage(placaCanvas, 0, 0);
  printArea.appendChild(copy);
  if (window.umami) umami.track('print-action', { preset: selectedPreset() });
  window.print();
});

downloadBtn.addEventListener('click', () => {
  if (!placaCanvas) return;
  const preset = selectedPreset();
  placaCanvas.toBlob((blob) => {
    if (!blob) { errorMsg.textContent = 'Não foi possível exportar o PNG.'; return; }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `placa-pix-${preset}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
    if (window.umami) umami.track('plate-downloaded', { preset });
  }, 'image/png');
});
